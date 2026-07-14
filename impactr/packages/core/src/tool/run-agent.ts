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
  type ToolCall,
} from "@impactr-ai/llm"
import { Clock, Effect, Layer, Schema, Stream } from "effect"
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

/** Reads a positive-integer override from the environment, else the fallback. */
const envPositiveInt = (variable: string, fallback: number) => {
  const parsed = Number(process.env[variable])
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

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
 * beyond this run as capacity frees up. Tune per deployment via
 * IMPACTR_MAX_PARALLEL_SUBAGENTS (e.g. a larger pool for cheap-model recon).
 */
const MAX_PARALLEL_SUBAGENTS = envPositiveInt("IMPACTR_MAX_PARALLEL_SUBAGENTS", 8)

/**
 * Upper bound on how many of a single turn's tool calls settle at once. Models
 * usually emit only a few, but bounding avoids spawning an unbounded number of
 * heavy scan processes when one does emit many. Tune via
 * IMPACTR_MAX_PARALLEL_TOOL_CALLS.
 */
const MAX_PARALLEL_TOOL_CALLS = envPositiveInt("IMPACTR_MAX_PARALLEL_TOOL_CALLS", 8)

/**
 * Generous ceiling on the text a subagent hands back to the orchestrator. A
 * subagent already returns only its final synthesis (raw tool output stays inside
 * its own loop), so this rarely fires — but a runaway result would otherwise bloat
 * every subsequent orchestrator turn. Kept high so normal structured output (e.g. a
 * recon target list) is never cut; when it does fire, a marker tells the
 * orchestrator to re-delegate a narrower task rather than silently losing data.
 */
const MAX_SUBAGENT_OUTPUT_CHARS = 32_000

const boundOutput = (text: string) =>
  text.length <= MAX_SUBAGENT_OUTPUT_CHARS
    ? text
    : `${text.slice(0, MAX_SUBAGENT_OUTPUT_CHARS)}\n\n[output truncated: ${
        text.length - MAX_SUBAGENT_OUTPUT_CHARS
      } more characters omitted — re-delegate a narrower task if you need the rest]`

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
        // Model tiering: honor the subagent's own configured model when set, so the
        // high-volume/low-reasoning agents (recon, explore) can run on a cheaper,
        // faster model than the orchestrator's, instead of always inheriting it.
        const model = yield* models.resolve(
          subagent.info.model ? { ...session, model: subagent.info.model } : session,
        )
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

        const startedAt = yield* Clock.currentTimeMillis
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
          const calls: ToolCall[] = []

          // Collect this turn's output; defer tool settlement until the stream
          // completes so the calls can be settled concurrently below.
          yield* llm.stream(request).pipe(
            Stream.runForEach((event) =>
              Effect.sync(() => {
                if (LLMEvent.is.textDelta(event)) {
                  textOutput += event.text
                  return
                }
                if (event.type === "tool-call") calls.push(event)
              }),
            ),
          )

          if (textOutput) finalOutput = textOutput
          if (calls.length > 0) {
            const toolCalls = calls.map((call) =>
              ToolCallPart.make({ id: call.id, name: call.name, input: call.input }),
            )
            // Settle a turn's tool calls in parallel instead of one at a time: a recon
            // step that fires several scans no longer runs them serially.
            const toolResultMessages = yield* Effect.all(
              calls.map((call) =>
                toolMaterialization
                  .settle({
                    sessionID: context.sessionID,
                    agent: subagent.id,
                    assistantMessageID: context.assistantMessageID,
                    call,
                  })
                  .pipe(
                    Effect.catch(() =>
                      Effect.succeed({ result: { type: "error" as const, value: "Tool execution failed" } }),
                    ),
                    Effect.map((settlement) =>
                      Message.tool(ToolResultPart.make({ id: call.id, name: call.name, result: settlement.result })),
                    ),
                  ),
              ),
              { concurrency: MAX_PARALLEL_TOOL_CALLS },
            )
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

        // Efficiency telemetry: rounds used, output size, model, and wall time per
        // subagent, so cost/latency per delegation is measurable and tunable.
        yield* Effect.logInfo("subagent settled", {
          agent: spec.agent,
          model: model.id,
          steps: currentStep,
          maxSteps,
          outputChars: finalOutput.length,
          elapsedMs: (yield* Clock.currentTimeMillis) - startedAt,
        })

        return boundOutput(finalOutput)
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
              const startedAt = yield* Clock.currentTimeMillis
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
              // Batch telemetry: wall time is the slowest task, not the sum, when the
              // pool absorbs the fan-out — the signal that parallelism is working.
              yield* Effect.logInfo("run_agents batch settled", {
                tasks: results.length,
                failures: results.filter((result) => result.error !== undefined).length,
                concurrency: MAX_PARALLEL_SUBAGENTS,
                elapsedMs: (yield* Clock.currentTimeMillis) - startedAt,
              })
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
