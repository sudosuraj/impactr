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
export const batchName = "run_agents"

/**
 * Fallback ceiling on a subagent's tool-call rounds when its definition does not
 * pin an explicit `steps` limit. Real recon/exploitation work needs many rounds
 * (scan → parse → pivot → re-scan), so this is deliberately high; a subagent
 * settles earlier by simply returning text with no further tool calls.
 */
const MAX_SUBAGENT_STEPS = 100

/**
 * Upper bound on how many subagents `run_agents` runs at once. The whole point of
 * the batch tool is real parallelism, but each subagent is a full LLM loop, so an
 * unbounded fan-out would exhaust provider rate limits and local resources. Tasks
 * beyond this run as capacity frees up.
 */
const MAX_PARALLEL_SUBAGENTS = 8

const AgentField = Schema.String.annotate({
  description:
    "The subagent to run. Pentest subagents: 'recon' (enumeration/scanning only), 'attack' (exploits one assigned vulnerability). Utility subagents: 'explore' (fast search), 'general' (multi-step reasoning). Any configured subagent id is accepted.",
})

const PromptField = Schema.String.annotate({
  description: "The specific instruction or task to delegate to the subagent.",
})

export const Input = Schema.Struct({
  agent: AgentField,
  prompt: PromptField,
  background: Schema.Boolean.pipe(Schema.optional).annotate({
    description:
      "If true, the subagent runs asynchronously and this call returns immediately with a job id, letting you continue. To run several subagents at once, either use run_agents or launch each with background=true.",
  }),
})

export const Task = Schema.Struct({
  agent: AgentField,
  prompt: PromptField,
})

export const BatchInput = Schema.Struct({
  tasks: Schema.Array(Task).annotate({
    description:
      "The subagents to launch in parallel, each with its own agent and prompt. They run concurrently and every result is collected and returned together. Use this to fan work out — e.g. one 'recon' subagent per host, or several 'attack' subagents against distinct vulnerabilities — instead of delegating one at a time.",
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

    /** Runs one subagent to settlement and returns its final text output. */
    const runSubagent = (spec: { readonly agent: string; readonly prompt: string }, context: Tool.Context) =>
      Effect.gen(function* () {
        const subagent = yield* agents.select(AgentV2.ID.make(spec.agent))
        if (!subagent.info)
          return yield* Effect.fail(new Error(`Unknown agent type: '${spec.agent}' is not a configured subagent`))
        const toolMaterialization = yield* toolRegistry.materialize(subagent.info.permissions)
        const session = yield* store.get(context.sessionID)
        if (!session) return yield* Effect.fail(new Error("Session not found"))
        const model = yield* models.resolve(session)
        const maxSteps = subagent.info.steps ?? MAX_SUBAGENT_STEPS

        // Build the system context once per subagent run and reuse it across every
        // step. It does not change between steps, and a byte-stable system prefix is
        // what lets provider prompt caching hit from step 2 onward instead of
        // re-billing the whole (growing) prompt uncached each turn.
        const systemContextCombined = yield* loadSystemContext(subagent)
        const generation = yield* SystemContext.initialize(systemContextCombined).pipe(Effect.orDie)
        const system = [subagent.info?.system, generation.baseline]
          .filter((part): part is string => part !== undefined && part.length > 0)
          .map(SystemPart.make)
        // Stable per-run cache key (mirrors the main runner) so the cached prefix is
        // reused across this subagent's steps.
        const baseCacheKey = /^ses_[0-9a-f]{64}$/.test(context.sessionID)
          ? context.sessionID.slice(4)
          : context.sessionID
        const promptCacheKey = `${baseCacheKey}:${subagent.id}`

        let currentStep = 1
        let messages: Message[] = [Message.user(spec.prompt)]
        let finalOutput = ""
        let settled = false

        while (!settled && currentStep <= maxSteps) {
          const request = LLM.request({
            model,
            providerOptions: { openai: { promptCacheKey } },
            system,
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
                  const settlement = yield* toolMaterialization
                    .settle({
                      sessionID: context.sessionID,
                      agent: subagent.id,
                      assistantMessageID: context.assistantMessageID,
                      call: event,
                    })
                    .pipe(
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
                content: [...(textOutput ? [{ type: "text" as const, text: textOutput }] : []), ...toolCalls],
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

    yield* tools
      .register({
        [name]: Tool.make({
          description:
            "Delegate a sub-task to a specialized subagent that executes tools inside the active workspace. Use 'recon' to enumerate/scan a target and 'attack' to exploit one identified vulnerability; use 'explore'/'general' for search and reasoning. Subagents run many tool rounds until they finish, not a fixed few. To run several subagents at once, prefer run_agents (fans out a list in parallel and collects every result) or pass background=true.",
          input: Input,
          output: Output,
          toModelOutput: ({ output }) => [{ type: "text", text: output.output }],
          execute: (input, context) =>
            Effect.gen(function* () {
              if (input.background) {
                const job = yield* backgroundJobs.start({
                  type: "subagent",
                  title: `Subagent: ${input.agent}`,
                  run: runSubagent({ agent: input.agent, prompt: input.prompt }, context),
                })
                return { output: `Subagent started asynchronously with background job ID: ${job.id}` }
              }
              const finalOutput = yield* runSubagent({ agent: input.agent, prompt: input.prompt }, context)
              return { output: finalOutput }
            }).pipe(
              Effect.mapError((err) => new ToolFailure({ message: err instanceof Error ? err.message : String(err) })),
            ),
        }),
        [batchName]: Tool.make({
          description:
            "Launch several subagents in parallel and collect all of their results in one call. Pass a list of tasks, each with its own agent and prompt; they execute concurrently (up to a bounded pool) instead of one at a time, and every subagent's output — or its error — is returned together. Use this to fan work out, e.g. one 'recon' subagent per host or several 'attack' subagents against distinct vulnerabilities.",
          input: BatchInput,
          output: Output,
          toModelOutput: ({ output }) => [{ type: "text", text: output.output }],
          execute: (input, context) =>
            Effect.gen(function* () {
              if (input.tasks.length === 0) return { output: "No tasks provided." }
              const results = yield* Effect.all(
                input.tasks.map((task, index) =>
                  runSubagent(task, context).pipe(
                    Effect.map((output) => ({ index, agent: task.agent, output, error: undefined as string | undefined })),
                    Effect.catch((err) =>
                      Effect.succeed({
                        index,
                        agent: task.agent,
                        output: "",
                        error: err instanceof Error ? err.message : String(err),
                      }),
                    ),
                  ),
                ),
                { concurrency: MAX_PARALLEL_SUBAGENTS },
              )
              const combined = results
                .map((result) => {
                  const header = `### [${result.index}] ${result.agent}`
                  const body = result.error ? `ERROR: ${result.error}` : result.output || "(no output)"
                  return `${header}\n${body}`
                })
                .join("\n\n")
              return { output: combined }
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
