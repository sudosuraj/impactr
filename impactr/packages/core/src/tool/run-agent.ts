export * as RunAgentTool from "./run-agent"

import {
  LLM,
  LLMClient,
  LLMEvent,
  Message,
  SystemPart,
  ToolCallPart,
  ToolResultPart,
  ToolFailure,
} from "@impactr-ai/llm"
import { Effect, Layer, Schema, Stream } from "effect"
import { makeLocationNode } from "../effect/app-node"
import { llmClient } from "../effect/app-node-platform"
import { AgentV2 } from "../agent"
import { Location } from "../location"
import { SystemContext } from "../system-context/index"
import { SystemContextRegistry } from "../system-context/registry"
import { SkillGuidance } from "../skill/guidance"
import { ReferenceGuidance } from "../reference/guidance"
import { ToolRegistry } from "./registry"
import { Tool } from "./tool"
import { Tools } from "./tools"
import { SessionStore } from "../session/store"
import { SessionRunnerModel } from "../session/runner/model"
import { BackgroundJob } from "../background-job"

export const name = "run_agent"

/**
 * Fallback ceiling on a subagent's tool-call rounds when its definition does not
 * pin an explicit `steps` limit. Real recon/exploitation work needs many rounds
 * (scan → parse → pivot → re-scan), so this is deliberately high; a subagent
 * settles earlier by simply returning text with no further tool calls.
 */
const MAX_SUBAGENT_STEPS = 100

export const Input = Schema.Struct({
  agent: Schema.String.annotate({
    description:
      "The subagent to run. Pentest subagents: 'recon' (enumeration/scanning only), 'attack' (exploits one assigned vulnerability). Utility subagents: 'explore' (fast search), 'general' (multi-step reasoning). Any configured subagent id is accepted.",
  }),
  prompt: Schema.String.annotate({
    description: "The specific instruction or task to delegate to the subagent.",
  }),
  background: Schema.Boolean.pipe(Schema.optional).annotate({
    description:
      "If true, the subagent runs asynchronously and this call returns immediately with a job id, letting you continue. To run several subagents at once, either emit multiple run_agent calls in a single turn (they execute concurrently) or launch them with background=true.",
  }),
})

export const Output = Schema.Struct({
  output: Schema.String,
})
export type Output = typeof Output.Type

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools.Service
    const llm = yield* LLMClient.Service
    const agents = yield* AgentV2.Service
    const location = yield* Location.Service
    const systemContext = yield* SystemContextRegistry.Service
    const skillGuidance = yield* SkillGuidance.Service
    const referenceGuidance = yield* ReferenceGuidance.Service
    const store = yield* SessionStore.Service
    const models = yield* SessionRunnerModel.Service
    const toolRegistry = yield* ToolRegistry.Service
    const backgroundJobs = yield* BackgroundJob.Service

    const loadSystemContext = (agent: AgentV2.Selection) =>
      Effect.all([systemContext.load(), skillGuidance.load(agent), referenceGuidance.load()], {
        concurrency: "unbounded",
      }).pipe(Effect.map(SystemContext.combine))

    yield* tools
      .register({
        [name]: Tool.make({
          description:
            "Delegate a sub-task to a specialized subagent that executes tools inside the active workspace. Use 'recon' to enumerate/scan a target and 'attack' to exploit one identified vulnerability; use 'explore'/'general' for search and reasoning. Subagents run many tool rounds until they finish, not a fixed few. To parallelize, launch several subagents in the same turn (emit multiple run_agent calls together) or pass background=true — they execute concurrently rather than one at a time.",
          input: Input,
          output: Output,
          toModelOutput: ({ output }) => [{ type: "text", text: output.output }],
          execute: (input, context) =>
            Effect.gen(function* () {
              const subagent = yield* agents.select(AgentV2.ID.make(input.agent))
              if (!subagent.info)
                return yield* Effect.fail(
                  new Error(`Unknown agent type: '${input.agent}' is not a configured subagent`),
                )
              const toolMaterialization = yield* toolRegistry.materialize(subagent.info.permissions)
              const session = yield* store.get(context.sessionID)
              if (!session) return yield* Effect.fail(new Error("Session not found"))
              const model = yield* models.resolve(session)
              const maxSteps = subagent.info.steps ?? MAX_SUBAGENT_STEPS

              const runAgentLoop = Effect.gen(function* () {
                let currentStep = 1
                let messages: Message[] = [Message.user(input.prompt)]
                let finalOutput = ""
                let settled = false

                while (!settled && currentStep <= maxSteps) {
                  const systemContextCombined = yield* loadSystemContext(subagent)
                  const generation = yield* SystemContext.initialize(systemContextCombined).pipe(Effect.orDie)
                  const request = LLM.request({
                    model,
                    system: [subagent.info?.system, generation.baseline]
                      .filter((part): part is string => part !== undefined && part.length > 0)
                      .map(SystemPart.make),
                    messages,
                    tools: toolMaterialization?.definitions ?? [],
                  })

                  let textOutput = ""
                  const toolCalls: ToolCallPart[] = []
                  const toolResultMessages: Message[] = []

                  yield* llm.stream(request).pipe(
                    Stream.runForEach((event) =>
                      Effect.gen(function* () {
                        if (LLMEvent.is.textDelta(event)) {
                          textOutput += event.text
                        }
                        if (event.type === "tool-call") {
                          toolCalls.push(
                            ToolCallPart.make({
                              id: event.id,
                              name: event.name,
                              input: event.input,
                            }),
                          )
                          const settlement = yield* toolMaterialization.settle({
                            sessionID: context.sessionID,
                            agent: subagent.id,
                            assistantMessageID: context.assistantMessageID,
                            call: event,
                          }).pipe(
                            Effect.catch(() =>
                              Effect.succeed({ result: { type: "error" as const, value: "Tool execution failed" } }),
                            ),
                          )
                          toolResultMessages.push(
                            Message.tool(
                              ToolResultPart.make({
                                id: event.id,
                                name: event.name,
                                result: settlement.result,
                              }),
                            ),
                          )
                        }
                      }),
                    ),
                  )

                  if (textOutput) finalOutput = textOutput
                  if (toolCalls.length > 0) {
                    messages = [
                      ...messages,
                      Message.make({
                        role: "assistant",
                        content: [
                          ...(textOutput ? [{ type: "text" as const, text: textOutput }] : []),
                          ...toolCalls,
                        ],
                      }),
                      ...toolResultMessages,
                    ]
                    currentStep++
                  } else {
                    finalOutput = textOutput
                    settled = true
                  }
                }

                return finalOutput
              })

              if (input.background) {
                const job = yield* backgroundJobs.start({
                  type: "subagent",
                  title: `Subagent: ${input.agent}`,
                  run: runAgentLoop,
                })
                return { output: `Subagent started asynchronously with background job ID: ${job.id}` }
              } else {
                const finalOutput = yield* runAgentLoop
                return { output: finalOutput }
              }
            }).pipe(
              Effect.mapError((err) => new ToolFailure({ message: err instanceof Error ? err.message : String(err) })),
            ),
        }),
      })
      .pipe(Effect.orDie)
  }),
)

export const node = makeLocationNode({
  name: "tool/run-agent",
  layer,
  deps: [
    ToolRegistry.node,
    AgentV2.node,
    llmClient,
    Location.node,
    SystemContextRegistry.node,
    SkillGuidance.node,
    ReferenceGuidance.node,
    SessionStore.node,
    SessionRunnerModel.node,
    BackgroundJob.node,
  ],
})
