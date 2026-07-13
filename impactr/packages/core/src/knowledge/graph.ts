import { Effect, Context, Layer } from "effect"
import { Database } from "../database/database"
import { GraphNodeTable } from "./sql"
import { makeGlobalNode } from "../effect/app-node"
import { eq } from "drizzle-orm"

export interface Finding {
  readonly id: string
  readonly type: string
  readonly data: unknown
  readonly noveltyScore: number
  readonly confidenceScore: number
  readonly impactScore: number
  /** novelty × impact × confidence — the priority signal for future exploration. */
  readonly potential: number
}

export interface Interface {
  readonly addFinding: (
    sessionId: string,
    finding: {
      readonly type: string
      readonly data: unknown
      readonly noveltyScore: number
      readonly confidenceScore: number
      readonly impactScore: number
    }
  ) => Effect.Effect<string>

  /** Highest-potential findings recorded for a session, so past discoveries inform future exploration. */
  readonly summarize: (sessionId: string, limit: number) => Effect.Effect<ReadonlyArray<Finding>>

  // Potential score is used by the hypothesis queue to prioritize investigation.
  readonly getPotentialScore: (findingId: string) => Effect.Effect<number>
}

export class KnowledgeGraph extends Context.Service<KnowledgeGraph, Interface>()("@impactr-ai/core/knowledge/graph") {}

export const layer = Layer.effect(
  KnowledgeGraph,
  Effect.gen(function* () {
    const { db } = yield* Database.Service

    return KnowledgeGraph.of({
      addFinding: (sessionId, finding) =>
        Effect.gen(function* () {
          const id = crypto.randomUUID()
          yield* db.insert(GraphNodeTable).values({
            id,
            session_id: sessionId as any,
            type: finding.type,
            data: finding.data,
            novelty_score: finding.noveltyScore,
            confidence_score: finding.confidenceScore,
            impact_score: finding.impactScore,
          }).pipe(Effect.orDie)
          
          return id
        }),

      summarize: (sessionId, limit) =>
        Effect.gen(function* () {
          const nodes = yield* db.select()
            .from(GraphNodeTable)
            .where(eq(GraphNodeTable.session_id, sessionId as any))
            .pipe(Effect.orDie)
          return nodes
            .map((n) => ({
              id: n.id,
              type: n.type,
              data: n.data,
              noveltyScore: n.novelty_score,
              confidenceScore: n.confidence_score,
              impactScore: n.impact_score,
              potential: n.novelty_score * n.impact_score * n.confidence_score,
            }))
            .sort((a, b) => b.potential - a.potential)
            .slice(0, limit)
        }),

      getPotentialScore: (findingId) =>
        Effect.gen(function* () {
          const node = yield* db.select()
            .from(GraphNodeTable)
            .where(eq(GraphNodeTable.id, findingId))
            .get()
            .pipe(Effect.orDie)
            
          if (!node) return 0
          
          // Priority = Novelty × Impact × Confidence
          return node.novelty_score * node.impact_score * node.confidence_score
        }),
    })
  })
)

export const node = makeGlobalNode({
  service: KnowledgeGraph,
  layer,
  deps: [Database.node],
})
