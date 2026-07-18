import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { KnowledgeGraph } from "@impactr-ai/core/knowledge/graph"
import { KnowledgeSaturation } from "@impactr-ai/core/session/saturation"

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0)

export const Parameters = Schema.Struct({
  type: Schema.String.annotate({ description: "The type of finding (e.g. 'subdomain', 'endpoint', 'vulnerability', 'credential')." }),
  data: Schema.Any.annotate({ description: "A JSON object with the details of the finding." }),
  noveltyScore: Schema.Number.annotate({ description: "0.0-1.0: how new or surprising this finding is." }),
  confidenceScore: Schema.Number.annotate({ description: "0.0-1.0: how confident you are in this finding." }),
  impactScore: Schema.Number.annotate({ description: "0.0-1.0: the potential security or operational impact." }),
})

export const RecordDiscoveryTool = Tool.define(
  "record_discovery",
  Effect.gen(function* () {
    const graph = yield* KnowledgeGraph
    const saturation = yield* KnowledgeSaturation
    return {
      description: `Record a meaningful finding into the Knowledge Graph during your continuous discovery. A finding can be a subdomain, endpoint, vulnerability, technology fingerprint, credential, or any valuable intelligence. Score it (novelty × impact × confidence) to prioritize future exploration. Re-recording a finding with stronger evidence upgrades its scores; recording a pure duplicate is reported as such so you pursue a different lead.`,
      parameters: Parameters,
      execute: ({ type, data, noveltyScore, confidenceScore, impactScore }, ctx) =>
        Effect.gen(function* () {
          const record = yield* graph.addFinding(ctx.sessionID as string, {
            type,
            data,
            noveltyScore: clamp01(noveltyScore),
            confidenceScore: clamp01(confidenceScore),
            impactScore: clamp01(impactScore),
          })
          // Only genuine progress feeds the saturation signal — re-recording a known finding with no
          // stronger evidence must not keep the engine running on stale ground.
          if (record.status !== "duplicate") yield* saturation.recordFinding(ctx.sessionID as string)
          const potential = `potential ${record.potential.toFixed(2)} (novelty × impact × confidence)`
          if (record.status === "created") return `New discovery recorded with ID: ${record.id} — ${potential}.`
          if (record.status === "upgraded") return `Existing finding ${record.id} upgraded with stronger evidence — ${potential}.`
          return `Already known: finding ${record.id} was recorded before with no stronger evidence (${potential}). Pursue a different lead rather than re-recording this.`
        }).pipe(
          Effect.catch((e: unknown) => Effect.succeed(`Error: ${e instanceof Error ? e.message : String(e)}`)),
          Effect.map((output) => ({ title: `record_discovery: ${type}`, metadata: {}, output })),
        ),
    }
  }),
)
