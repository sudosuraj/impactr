export * as HostedKnowledgeGraph from "./knowledge"

import { Effect } from "effect"
import { and, eq } from "drizzle-orm"
import type { EngagementSchema } from "../../engagement/schema"
import type { SessionSchema } from "../../session/schema"
import type { HostedDatabase } from "../hosted-database"
import { HostedGraphNodeTable } from "./pentest-sql"

/** Engagement-scoped counterpart of knowledge/graph.ts's addFinding, for record_discovery. */

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null"
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`
}

const fingerprintOf = (type: string, data: unknown): string => `${type} ${stableStringify(data)}`

export const addFinding = (
  db: HostedDatabase.DatabaseShape,
  engagementId: EngagementSchema.ID,
  sessionId: SessionSchema.ID,
  finding: {
    readonly type: string
    readonly data: unknown
    readonly noveltyScore: number
    readonly confidenceScore: number
    readonly impactScore: number
  },
) =>
  Effect.gen(function* () {
    const fingerprint = fingerprintOf(finding.type, finding.data)
    const existing = yield* db
      .select({ id: HostedGraphNodeTable.id })
      .from(HostedGraphNodeTable)
      .where(and(eq(HostedGraphNodeTable.engagement_id, engagementId), eq(HostedGraphNodeTable.fingerprint, fingerprint)))
      .get()
      .pipe(Effect.orDie)
    if (existing) return existing.id

    const id = crypto.randomUUID()
    yield* db
      .insert(HostedGraphNodeTable)
      .values({
        id,
        engagement_id: engagementId,
        session_id: sessionId,
        type: finding.type,
        data: finding.data,
        novelty_score: finding.noveltyScore,
        confidence_score: finding.confidenceScore,
        impact_score: finding.impactScore,
        fingerprint,
      })
      .pipe(Effect.orDie)

    return id
  })

export const getPotentialScore = (db: HostedDatabase.DatabaseShape, findingId: string) =>
  Effect.gen(function* () {
    const node = yield* db
      .select()
      .from(HostedGraphNodeTable)
      .where(eq(HostedGraphNodeTable.id, findingId))
      .get()
      .pipe(Effect.orDie)

    if (!node) return 0

    return node.novelty_score * node.impact_score * node.confidence_score
  })
