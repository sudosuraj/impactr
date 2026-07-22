export * as QueueHypothesisTool from "./queue-hypothesis"

import { ToolFailure } from "@impactr-ai/llm"
import { Effect, Layer, Option, Schema } from "effect"
import { makeLocationNode } from "../effect/app-node"
import { ToolRegistry } from "./registry"
import { Tool } from "./tool"
import { Tools } from "./tools"
import { HypothesisQueue, node as HypothesisQueueNode } from "../session/hypothesis-queue"
import { KnowledgeGraph, node as KnowledgeGraphNode } from "../knowledge/graph"
import { KnowledgeSaturation, node as KnowledgeSaturationNode } from "../session/saturation"
import { EngagementReport, node as EngagementReportNode } from "../session/engagement-report"
import { HostedContext, node as HostedContextNode } from "../session/hosted-context"
import { HostedAttackGraph } from "../database/hosted/attack-graph"
import { HostedHypothesisQueue } from "../database/hosted/hypothesis-queue"
import { HostedKnowledgeGraph } from "../database/hosted/knowledge"
import { PermissionV2 } from "../permission"

export const name = "queue_hypothesis"

/** Clamp a model-supplied priority into [0,1] so it stays comparable with computed potential scores. */
const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0)

export const description = `Your hypothesis backlog — the reactive engine of a long engagement. Queue side-leads you spot mid-task so they are never lost, then work them down when your current thread settles so the engagement keeps going instead of stopping at the first pass.
- action "add" (default): queue a follow-up — a promising parameter, a partial auth bypass, a notably vulnerable service. It is prioritized by the source finding's computed potential (novelty × impact × confidence), falling back to your stated priority.
- action "next": pull the highest-potential queued hypothesis and work it now (delegate the heavy part as usual). Keep pulling until the backlog is empty before you wind down — an empty backlog with scope exhausted is how an engagement concludes.
- action "list": review everything still queued.`

export const Input = Schema.Struct({
  action: Schema.Literals(["add", "next", "list"]).pipe(Schema.optional).annotate({
    description:
      "add (queue a new follow-up, default), next (pull the highest-potential queued hypothesis to work on now), or list (review the backlog).",
  }),
  sourceFindingId: Schema.String.pipe(Schema.optional).annotate({
    description: "For 'add': the ID of the finding in the Knowledge Graph that sparked this hypothesis",
  }),
  description: Schema.String.pipe(Schema.optional).annotate({
    description: "For 'add': a clear description of the task or hypothesis to investigate",
  }),
  priority: Schema.Number.pipe(Schema.optional).annotate({
    description: "For 'add': 0.0-1.0 fallback priority (used only if the source finding has no score yet)",
  }),
})

export const Output = Schema.Struct({
  summary: Schema.String,
})
export type Output = typeof Output.Type

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools.Service
    const queue = yield* HypothesisQueue
    const graph = yield* KnowledgeGraph
    const saturation = yield* KnowledgeSaturation
    const engagementReport = yield* EngagementReport.Service
    const hostedContext = yield* HostedContext.Service
    const permission = yield* PermissionV2.Service

    yield* tools
      .register({
        [name]: Tool.make({
          description,
          input: Input,
          output: Output,
          toModelOutput: ({ output }) => [{ type: "text", text: output.summary }],
          execute: (input, context) =>
            permission
              .assert({
                action: "queue_hypothesis",
                resources: ["*"],
                sessionID: context.sessionID,
                agent: context.agent,
                source: { type: "tool", messageID: context.assistantMessageID, callID: context.toolCallID },
              })
              .pipe(
                Effect.mapError(() => new ToolFailure({ message: "Permission denied: queue_hypothesis" })),
                Effect.andThen(
                  hostedContext.resolve(context.sessionID as any).pipe(
                    Effect.flatMap((hosted) => {
                      const action = input.action ?? "add"

                      if (action === "next")
                        return (
                          Option.isSome(hosted)
                            ? HostedHypothesisQueue.popHighestPriority(hosted.value.db, hosted.value.engagementID)
                            : queue.popHighestPriority(context.sessionID).pipe(Effect.orDie)
                        ).pipe(
                          Effect.flatMap((next) => {
                            if (!next)
                              // Backlog drained — the engagement is winding down. Auto-synthesize the
                              // consolidated report now, deterministically, so a run always ends with a
                              // readable artifact.
                              return saturation
                                .isSaturated(context.sessionID)
                                .pipe(Effect.catch(() => Effect.succeed(false)))
                                .pipe(
                                  Effect.flatMap((saturated) => {
                                    const conclusion: EngagementReport.Conclusion = saturated
                                      ? "saturated"
                                      : "backlog-drained"
                                    // A hosted engagement's graph/findings live in the per-engagement DB, not
                                    // the local session-scoped stores EngagementReport.Service reads from —
                                    // calling that service here would always synthesize an empty report.
                                    // Render from the hosted data directly instead; there's no established
                                    // hosted file-output location yet, so this is returned inline rather than
                                    // written to a file (unlike the local path).
                                    const reportLine = Option.isSome(hosted)
                                      ? Effect.all([
                                          HostedKnowledgeGraph.summarize(hosted.value.db, hosted.value.engagementID, 200),
                                          HostedAttackGraph.getGraph(hosted.value.db, hosted.value.engagementID),
                                        ]).pipe(
                                          Effect.map(([findings, graphState]) =>
                                            findings.length === 0 && Object.keys(graphState.nodes).length === 0
                                              ? ""
                                              : `\n\nConsolidated engagement report:\n\n${EngagementReport.render({
                                                  sessionId: context.sessionID,
                                                  generatedAt: new Date(),
                                                  conclusion,
                                                  findings,
                                                  graph: graphState,
                                                  plan: [],
                                                })}`,
                                          ),
                                          Effect.catch(() => Effect.succeed("")),
                                        )
                                      : engagementReport.generate(context.sessionID, conclusion).pipe(
                                          Effect.catch(() => Effect.succeed(undefined)),
                                          Effect.map((report) =>
                                            report ? ` Consolidated engagement report written to ${report.path}.` : "",
                                          ),
                                        )
                                    return reportLine.pipe(
                                      Effect.map((reportLine) => ({
                                        summary: saturated
                                          ? `Backlog empty and knowledge saturated — the engagement is concluding.${reportLine} Do a final skim of the attack graph; if nothing new remains, you are done.`
                                          : `Backlog empty — no queued hypotheses remain.${reportLine} If genuinely fresh surface remains (new subdomains/ports/credentials), re-scan it and queue leads; otherwise wind down.`,
                                      })),
                                    )
                                  }),
                                )
                            // Work it inline this turn; mark done so it isn't re-pulled. New leads found go back in via "add".
                            return (
                              Option.isSome(hosted)
                                ? HostedHypothesisQueue.complete(hosted.value.db, next.id, "done")
                                : queue.complete(next.id, "done").pipe(Effect.orDie)
                            ).pipe(
                              Effect.map(() => ({
                                summary: `Next hypothesis (potential ${next.priority.toFixed(2)}): ${next.description}\n\nWork this now — delegate the heavy part via task — then pull the next one.`,
                              })),
                            )
                          }),
                        )

                      if (action === "list")
                        return (
                          Option.isSome(hosted)
                            ? HostedHypothesisQueue.peekAll(hosted.value.db, hosted.value.engagementID)
                            : queue.peekAll(context.sessionID).pipe(Effect.orDie)
                        ).pipe(
                          Effect.map((pending) => ({
                            summary:
                              pending.length === 0
                                ? "No pending hypotheses in the backlog."
                                : `Pending hypotheses (highest potential first):\n${pending
                                    .map((h) => `- [${h.priority.toFixed(2)}] ${h.description} (id:${h.id})`)
                                    .join("\n")}`,
                          })),
                        )

                      // add
                      if (!input.sourceFindingId || !input.description)
                        return Effect.succeed({ summary: "Error: 'add' requires sourceFindingId and description." })
                      // Prioritize by the source finding's computed potential (novelty × impact ×
                      // confidence). Fall back to the model's stated priority when the finding has no
                      // score yet.
                      return (
                        Option.isSome(hosted)
                          ? HostedKnowledgeGraph.getPotentialScore(hosted.value.db, input.sourceFindingId)
                          : graph.getPotentialScore(input.sourceFindingId)
                      ).pipe(
                        Effect.flatMap((potential) =>
                          Option.isSome(hosted)
                            ? HostedHypothesisQueue.push(hosted.value.db, hosted.value.engagementID, context.sessionID as any, {
                                sourceFindingId: input.sourceFindingId as string,
                                description: input.description as string,
                                priority: potential > 0 ? potential : clamp01(input.priority ?? 0.5),
                              })
                            : queue
                                .push(context.sessionID, {
                                  sourceFindingId: input.sourceFindingId as string,
                                  description: input.description as string,
                                  priority: potential > 0 ? potential : clamp01(input.priority ?? 0.5),
                                })
                                .pipe(Effect.orDie),
                        ),
                        Effect.map((hypothesisId) => ({
                          summary: `Hypothesis queued successfully with ID: ${hypothesisId}.`,
                        })),
                      )
                    }),
                  ),
                ),
              ),
        }),
      })
      .pipe(Effect.orDie)
  }),
)

export const node = makeLocationNode({
  name: "tool/queue-hypothesis",
  layer,
  deps: [
    ToolRegistry.node,
    PermissionV2.node,
    HypothesisQueueNode,
    KnowledgeGraphNode,
    KnowledgeSaturationNode,
    EngagementReportNode,
    HostedContextNode,
  ],
})
