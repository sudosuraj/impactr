export * as HostedHypothesisQueue from "./hypothesis-queue"

import { Effect } from "effect"
import { and, desc, eq } from "drizzle-orm"
import type { EngagementSchema } from "../../engagement/schema"
import type { SessionSchema } from "../../session/schema"
import type { HostedDatabase } from "../hosted-database"
import { HostedHypothesisQueueTable } from "./pentest-sql"

export interface Hypothesis {
  readonly id: string
  readonly sourceFindingId: string
  readonly description: string
  readonly priority: number
}

export type HypothesisOutcome = "done" | "failed"

/** Engagement-scoped counterpart of session/hypothesis-queue.ts's push, for queue_hypothesis. */
export const push = (
  db: HostedDatabase.DatabaseShape,
  engagementId: EngagementSchema.ID,
  sessionId: SessionSchema.ID,
  hypothesis: { readonly sourceFindingId: string; readonly description: string; readonly priority: number },
) =>
  Effect.gen(function* () {
    const existing = yield* db
      .select({ id: HostedHypothesisQueueTable.id })
      .from(HostedHypothesisQueueTable)
      .where(
        and(
          eq(HostedHypothesisQueueTable.engagement_id, engagementId),
          eq(HostedHypothesisQueueTable.status, "pending"),
          eq(HostedHypothesisQueueTable.description, hypothesis.description),
        ),
      )
      .get()
      .pipe(Effect.orDie)
    if (existing) return existing.id

    const id = crypto.randomUUID()
    yield* db
      .insert(HostedHypothesisQueueTable)
      .values({
        id,
        engagement_id: engagementId,
        session_id: sessionId,
        source_finding_id: hypothesis.sourceFindingId,
        description: hypothesis.description,
        priority: hypothesis.priority,
        status: "pending",
      })
      .pipe(Effect.orDie)

    return id
  })

/** Engagement-scoped counterpart of session/hypothesis-queue.ts's popHighestPriority. */
export const popHighestPriority = (
  db: HostedDatabase.DatabaseShape,
  engagementId: EngagementSchema.ID,
): Effect.Effect<Hypothesis | undefined> =>
  Effect.gen(function* () {
    const rows = yield* db
      .select()
      .from(HostedHypothesisQueueTable)
      .where(and(eq(HostedHypothesisQueueTable.engagement_id, engagementId), eq(HostedHypothesisQueueTable.status, "pending")))
      .orderBy(desc(HostedHypothesisQueueTable.priority))
      .limit(1)
      .pipe(Effect.orDie)

    if (rows.length === 0) return undefined
    const row = rows[0]

    yield* db
      .update(HostedHypothesisQueueTable)
      .set({ status: "processing" })
      .where(eq(HostedHypothesisQueueTable.id, row.id))
      .pipe(Effect.orDie)

    return {
      id: row.id,
      sourceFindingId: row.source_finding_id,
      description: row.description,
      priority: row.priority,
    }
  })

/** Engagement-scoped counterpart of session/hypothesis-queue.ts's peekAll. */
export const peekAll = (
  db: HostedDatabase.DatabaseShape,
  engagementId: EngagementSchema.ID,
): Effect.Effect<ReadonlyArray<Hypothesis>> =>
  Effect.gen(function* () {
    const rows = yield* db
      .select()
      .from(HostedHypothesisQueueTable)
      .where(and(eq(HostedHypothesisQueueTable.engagement_id, engagementId), eq(HostedHypothesisQueueTable.status, "pending")))
      .orderBy(desc(HostedHypothesisQueueTable.priority))
      .pipe(Effect.orDie)

    return rows.map((row) => ({
      id: row.id,
      sourceFindingId: row.source_finding_id,
      description: row.description,
      priority: row.priority,
    }))
  })

/** Engagement-scoped counterpart of session/hypothesis-queue.ts's complete. */
export const complete = (db: HostedDatabase.DatabaseShape, id: string, outcome: HypothesisOutcome): Effect.Effect<void> =>
  db
    .update(HostedHypothesisQueueTable)
    .set({ status: outcome })
    .where(eq(HostedHypothesisQueueTable.id, id))
    .pipe(Effect.orDie, Effect.asVoid)

/**
 * Engagement-scoped counterpart of session/hypothesis-queue.ts's reclaimStale: returns hypotheses
 * left "processing" by an interrupted drain to "pending" so they are re-explored. Not yet called
 * anywhere — the local queue's version is invoked from SessionRunner.run's recovery path
 * (session/runner/llm.ts), which would need to resolve HostedContext to call this too; that wiring
 * is intentionally left for a separate change rather than touched here.
 */
export const reclaimStale = (db: HostedDatabase.DatabaseShape, engagementId: EngagementSchema.ID): Effect.Effect<void> =>
  db
    .update(HostedHypothesisQueueTable)
    .set({ status: "pending" })
    .where(and(eq(HostedHypothesisQueueTable.engagement_id, engagementId), eq(HostedHypothesisQueueTable.status, "processing")))
    .pipe(Effect.orDie, Effect.asVoid)
