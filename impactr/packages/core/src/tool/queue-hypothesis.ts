export * as QueueHypothesisTool from "./queue-hypothesis"

import { ToolFailure } from "@impactr-ai/llm"
import { Effect, Layer, Schema } from "effect"
import { makeLocationNode } from "../effect/app-node"
import { ToolRegistry } from "./registry"
import { Tool } from "./tool"
import { Tools } from "./tools"
import { HypothesisQueue, node as HypothesisQueueNode } from "../session/hypothesis-queue"
import { KnowledgeGraph, node as KnowledgeGraphNode } from "../knowledge/graph"
import { PermissionV2 } from "../permission"

export const name = "queue_hypothesis"

/** Clamp a model-supplied priority into [0,1] so it stays comparable with computed potential scores. */
const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0)

export const description = `Use this tool to queue a new hypothesis or task for future exploration.
When you discover something interesting that requires a separate focused investigation, you should queue a hypothesis for it instead of getting distracted.
This allows the Continuous Discovery Engine to prioritize and schedule the investigation properly.`

export const Input = Schema.Struct({
  sourceFindingId: Schema.String.annotate({ description: "The ID of the finding in the Knowledge Graph that sparked this hypothesis" }),
  description: Schema.String.annotate({ description: "A clear description of the task or hypothesis to investigate" }),
  priority: Schema.Number.annotate({ description: "A score from 0.0 to 1.0 indicating how urgent or important this investigation is" }),
})

export const Output = Schema.Struct({
  hypothesisId: Schema.String,
})
export type Output = typeof Output.Type

export const toModelOutput = (hypothesisId: string) => {
  return `Hypothesis queued successfully with ID: ${hypothesisId}.`
}

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools.Service
    const queue = yield* HypothesisQueue
    const graph = yield* KnowledgeGraph
    const permission = yield* PermissionV2.Service

    yield* tools
      .register({
        [name]: Tool.make({
          description,
          input: Input,
          output: Output,
          toModelOutput: ({ output }) => [
            { type: "text", text: toModelOutput(output.hypothesisId) },
          ],
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
                  // Prioritize by the source finding's computed potential
                  // (novelty × impact × confidence). Fall back to the model's
                  // stated priority when the finding has no score yet.
                  graph.getPotentialScore(input.sourceFindingId).pipe(
                    Effect.flatMap((potential) =>
                      queue.push(context.sessionID, {
                        sourceFindingId: input.sourceFindingId,
                        description: input.description,
                        priority: potential > 0 ? potential : clamp01(input.priority),
                      }).pipe(Effect.orDie),
                    ),
                  ),
                ),
                Effect.map((hypothesisId) => ({ hypothesisId: hypothesisId as string })),
              ),
        }),
      })
      .pipe(Effect.orDie)
  }),
)

export const node = makeLocationNode({
  name: "tool/queue-hypothesis",
  layer,
  deps: [ToolRegistry.node, PermissionV2.node, HypothesisQueueNode, KnowledgeGraphNode],
})
