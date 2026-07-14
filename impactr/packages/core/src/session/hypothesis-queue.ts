import { Effect, Context, Layer } from "effect"
import { Database } from "../database/database"
import { HypothesisQueueTable } from "./sql"
import { makeGlobalNode } from "../effect/app-node"
import { eq, and, desc } from "drizzle-orm"

export interface Hypothesis {
  readonly id: string
  readonly sourceFindingId: string
  readonly description: string
  readonly priority: number
}

export type HypothesisOutcome = "done" | "failed"

export interface Interface {
  readonly push: (sessionId: string, hypothesis: Omit<Hypothesis, "id">) => Effect.Effect<string>
  readonly popHighestPriority: (sessionId: string) => Effect.Effect<Hypothesis | undefined>
  readonly peekAll: (sessionId: string) => Effect.Effect<ReadonlyArray<Hypothesis>>
  readonly complete: (id: string, outcome: HypothesisOutcome) => Effect.Effect<void>
  /** Return hypotheses left "processing" by an interrupted drain to "pending" so they are re-explored. */
  readonly reclaimStale: (sessionId: string) => Effect.Effect<void>
}

export class HypothesisQueue extends Context.Service<HypothesisQueue, Interface>()("@impactr-ai/core/session/hypothesis-queue") {}

export const layer = Layer.effect(
  HypothesisQueue,
  Effect.gen(function* () {
    const { db } = yield* Database.Service

    return HypothesisQueue.of({
      push: (sessionId, hypothesis) =>
        Effect.gen(function* () {
          // Dedupe: don't queue a hypothesis identical to one already pending,
          // so the engine doesn't spend cycles re-exploring the same lead.
          const existing = yield* db.select({ id: HypothesisQueueTable.id })
            .from(HypothesisQueueTable)
            .where(
              and(
                eq(HypothesisQueueTable.session_id, sessionId as any),
                eq(HypothesisQueueTable.status, "pending"),
                eq(HypothesisQueueTable.description, hypothesis.description),
              ),
            )
            .get()
            .pipe(Effect.orDie)
          if (existing) return existing.id

          const id = crypto.randomUUID()
          yield* db.insert(HypothesisQueueTable).values({
            id,
            session_id: sessionId as any,
            source_finding_id: hypothesis.sourceFindingId,
            description: hypothesis.description,
            priority: hypothesis.priority,
            status: "pending",
          }).pipe(Effect.orDie)

          return id
        }),

      popHighestPriority: (sessionId) =>
        Effect.gen(function* () {
          const rows = yield* db.select()
            .from(HypothesisQueueTable)
            .where(and(eq(HypothesisQueueTable.session_id, sessionId as any), eq(HypothesisQueueTable.status, "pending")))
            .orderBy(desc(HypothesisQueueTable.priority))
            .limit(1)
            .pipe(Effect.orDie)
            
          if (rows.length === 0) return undefined
          
          const row = rows[0]
          
          yield* db.update(HypothesisQueueTable)
            .set({ status: "processing" })
            .where(eq(HypothesisQueueTable.id, row.id))
            .pipe(Effect.orDie)
            
          return {
            id: row.id,
            sourceFindingId: row.source_finding_id,
            description: row.description,
            priority: row.priority,
          }
        }),

      peekAll: (sessionId) =>
        Effect.gen(function* () {
          const rows = yield* db.select()
            .from(HypothesisQueueTable)
            .where(and(eq(HypothesisQueueTable.session_id, sessionId as any), eq(HypothesisQueueTable.status, "pending")))
            .orderBy(desc(HypothesisQueueTable.priority))
            .pipe(Effect.orDie)
            
          return rows.map(r => ({
            id: r.id,
            sourceFindingId: r.source_finding_id,
            description: r.description,
            priority: r.priority,
          }))
        }),

      complete: (id, outcome) =>
        db.update(HypothesisQueueTable)
          .set({ status: outcome })
          .where(eq(HypothesisQueueTable.id, id))
          .pipe(Effect.orDie, Effect.asVoid),

      reclaimStale: (sessionId) =>
        db.update(HypothesisQueueTable)
          .set({ status: "pending" })
          .where(
            and(
              eq(HypothesisQueueTable.session_id, sessionId as any),
              eq(HypothesisQueueTable.status, "processing"),
            ),
          )
          .pipe(Effect.orDie, Effect.asVoid),
    })
  })
)

export const node = makeGlobalNode({
  service: HypothesisQueue,
  layer,
  deps: [Database.node],
})
