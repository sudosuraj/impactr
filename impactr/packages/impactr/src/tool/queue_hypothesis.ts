import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { HypothesisQueue } from "@impactr-ai/core/session/hypothesis-queue"
import { KnowledgeGraph } from "@impactr-ai/core/knowledge/graph"
import { Session } from "@/session/session"
import { engagementRoot } from "./engagement-session"

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0)

export const Parameters = Schema.Struct({
  sourceFindingId: Schema.String.annotate({ description: "The ID of the Knowledge Graph finding that sparked this hypothesis." }),
  description: Schema.String.annotate({ description: "A clear description of the task or hypothesis to investigate." }),
  priority: Schema.Number.annotate({ description: "0.0-1.0: how urgent or important this investigation is (used as a fallback if the source finding has no score)." }),
})

export const QueueHypothesisTool = Tool.define(
  "queue_hypothesis",
  Effect.gen(function* () {
    const queue = yield* HypothesisQueue
    const graph = yield* KnowledgeGraph
    const sessions = yield* Session.Service
    return {
      description: `Queue a follow-up worth investigating later instead of derailing your current task. When you spot an interesting side-lead — a promising parameter, a partial auth bypass, a notably vulnerable service — queue a hypothesis for it. It is prioritized by the source finding's computed potential (novelty × impact × confidence), falling back to your stated priority when the finding has no score yet.`,
      parameters: Parameters,
      execute: ({ sourceFindingId, description, priority }, ctx) =>
        Effect.gen(function* () {
          const sid = yield* engagementRoot(sessions, ctx.sessionID as string)
          const potential = yield* graph.getPotentialScore(sourceFindingId)
          const id = yield* queue.push(sid, {
            sourceFindingId,
            description,
            priority: potential > 0 ? potential : clamp01(priority),
          })
          return `Hypothesis queued successfully with ID: ${id}.`
        }).pipe(
          Effect.catch((e: unknown) => Effect.succeed(`Error: ${e instanceof Error ? e.message : String(e)}`)),
          Effect.map((output) => ({ title: "queue_hypothesis", metadata: {}, output })),
        ),
    }
  }),
)
