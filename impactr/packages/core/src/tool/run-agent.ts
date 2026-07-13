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

export const name = "run_agent"

export const Input = Schema.Struct({
  agent: Schema.Literals(["explore", "general"]).annotate({
    description: "The subagent to run. 'explore' is fast and specialized in search. 'general' handles complex multi-step reasoning.",
  }),
  prompt: Schema.String.annotate({
    description: "The specific instruction or task to delegate to the subagent.",
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

    const loadSystemContext = (agent: AgentV2.Selection) =>
      Effect.all([systemContext.load(), skillGuidance.load(agent), referenceGuidance.load()], {
        concurrency: "unbounded",
      }).pipe(Effect.map(SystemContext.combine))

    yield* tools
      .register({
        [name]: Tool.make({
          description:
            "Delegate a sub-task (like codebase search or local file editing) to a subagent. Subagents run concurrently and execute tools inside the active workspace.",
          input: Input,
          output: Output,
          toModelOutput: ({ output }) => [{ type: "text", text: output.output }],
          execute: (input, context) =>
            Effect.gen(function* () {
              const subagent = yield* agents.select(AgentV2.ID.make(input.agent))
              const toolMaterialization = yield* toolRegistry.materialize(subagent.info?.permissions)
              const session = yield* store.get(context.sessionID)
              if (!session) return yield* Effect.fail(new Error("Session not found"))
              const model = yield* models.resolve(session)

              let currentStep = 1
              let messages: Message[] = [Message.user(input.prompt)]
              let finalOutput = ""
              let settled = false

              while (!settled && currentStep <= 5) {
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

              return { output: finalOutput }
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
  ],
})
