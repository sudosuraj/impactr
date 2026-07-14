export * as RecordDiscoveryTool from "./record-discovery"

import { ToolFailure } from "@impactr-ai/llm"
import { Effect, Layer, Option, Schema } from "effect"
import { makeLocationNode } from "../effect/app-node"
import { ToolRegistry } from "./registry"
import { Tool } from "./tool"
import { Tools } from "./tools"
import { KnowledgeGraph, node as KnowledgeGraphNode } from "../knowledge/graph"
import { KnowledgeSaturation, node as KnowledgeSaturationNode } from "../session/saturation"
import { HostedContext, node as HostedContextNode } from "../session/hosted-context"
import { HostedKnowledgeGraph } from "../database/hosted/knowledge"
import { PermissionV2 } from "../permission"

export const name = "record_discovery"

/** Clamp a model-supplied score into [0,1] so a malformed value can't distort the potential ranking. */
const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0)

export const description = `Use this tool to manually record a meaningful finding into the Knowledge Graph during your continuous discovery process. 
A finding can be a subdomain, an endpoint, a vulnerability, a technology fingerprint, or any other valuable piece of intelligence. 
You must score the finding to help prioritize future exploration.`

export const Input = Schema.Struct({
  type: Schema.String.annotate({ description: "The type of the finding (e.g. 'subdomain', 'endpoint', 'vulnerability', 'credential')" }),
  data: Schema.Unknown.annotate({ description: "A JSON object containing the details of the finding" }),
  noveltyScore: Schema.Number.annotate({ description: "A score from 0.0 to 1.0 indicating how new or surprising this finding is" }),
  confidenceScore: Schema.Number.annotate({ description: "A score from 0.0 to 1.0 indicating how confident you are in this finding" }),
  impactScore: Schema.Number.annotate({ description: "A score from 0.0 to 1.0 indicating the potential security or operational impact" }),
})

export const Output = Schema.Struct({
  findingId: Schema.String,
})
export type Output = typeof Output.Type

export const toModelOutput = (findingId: string) => {
  return `Discovery recorded successfully with ID: ${findingId}.`
}

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools.Service
    const graph = yield* KnowledgeGraph
    const saturation = yield* KnowledgeSaturation
    const hostedContext = yield* HostedContext.Service
    const permission = yield* PermissionV2.Service

    yield* tools
      .register({
        [name]: Tool.make({
          description,
          input: Input,
          output: Output,
          toModelOutput: ({ output }) => [
            { type: "text", text: toModelOutput(output.findingId) },
          ],
          execute: (input, context) =>
            permission
              .assert({
                action: "record_discovery",
                resources: ["*"],
                sessionID: context.sessionID,
                agent: context.agent,
                source: { type: "tool", messageID: context.assistantMessageID, callID: context.toolCallID },
              })
              .pipe(
                Effect.mapError(() => new ToolFailure({ message: "Permission denied: record_discovery" })),
                Effect.andThen(
                  hostedContext.resolve(context.sessionID as any).pipe(
                    Effect.flatMap((hosted) =>
                      Option.isSome(hosted)
                        ? HostedKnowledgeGraph.addFinding(hosted.value.db, hosted.value.engagementID, context.sessionID as any, {
                            type: input.type,
                            data: input.data,
                            noveltyScore: clamp01(input.noveltyScore),
                            confidenceScore: clamp01(input.confidenceScore),
                            impactScore: clamp01(input.impactScore),
                          })
                        : graph.addFinding(context.sessionID, {
                            type: input.type,
                            data: input.data,
                            noveltyScore: clamp01(input.noveltyScore),
                            confidenceScore: clamp01(input.confidenceScore),
                            impactScore: clamp01(input.impactScore),
                          }).pipe(Effect.orDie),
                    ),
                  ),
                ),
                Effect.tap(() => saturation.recordFinding(context.sessionID).pipe(Effect.orDie)),
                Effect.map((findingId) => ({ findingId: findingId as string })),
              ),
        }),
      })
      .pipe(Effect.orDie)
  }),
)

export const node = makeLocationNode({
  name: "tool/record-discovery",
  layer,
  deps: [ToolRegistry.node, PermissionV2.node, KnowledgeGraphNode, KnowledgeSaturationNode, HostedContextNode],
})
