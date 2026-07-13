import { Effect, Context, Layer } from "effect"
import { Database } from "../database/database"
import { GraphNodeTable } from "./sql"
import { makeGlobalNode } from "../effect/app-node"
import { eq, and } from "drizzle-orm"

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

  readonly queryContext: (sessionId: string, query: string) => Effect.Effect<ReadonlyArray<unknown>>
  
  // Potential score is used by the hypothesis queue
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

      queryContext: (sessionId, query) =>
        Effect.gen(function* () {
          // Simplistic implementation for now; could be expanded with embedding similarity
          const nodes = yield* db.select()
            .from(GraphNodeTable)
            .where(eq(GraphNodeTable.session_id, sessionId as any))
            .limit(50)
            .pipe(Effect.orDie)
          return nodes
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
