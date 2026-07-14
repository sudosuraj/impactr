export * as HostedHypothesisQueue from "./hypothesis-queue"

import { Effect } from "effect"
import { and, eq } from "drizzle-orm"
import type { EngagementSchema } from "../../engagement/schema"
import type { SessionSchema } from "../../session/schema"
import type { HostedDatabase } from "../hosted-database"
import { HostedHypothesisQueueTable } from "./pentest-sql"

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
