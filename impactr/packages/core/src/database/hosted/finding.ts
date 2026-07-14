export * as HostedFinding from "./finding"

import { Effect } from "effect"
import type { EngagementSchema } from "../../engagement/schema"
import type { SessionSchema } from "../../session/schema"
import type { HostedDatabase } from "../hosted-database"
import { FindingTable } from "../../finding/hosted-sql"
import { FindingSchema } from "../../finding/schema"

/** Inserts the dashboard-facing DB row draft_vulnerability additionally writes when hosted. */
export const create = (
  db: HostedDatabase.DatabaseShape,
  engagementId: EngagementSchema.ID,
  sessionId: SessionSchema.ID,
  input: {
    readonly title: string
    readonly description: string
    readonly cvss: string
    readonly impact: string
    readonly remediation: string
  },
) =>
  Effect.gen(function* () {
    const id = FindingSchema.ID.create()
    yield* db
      .insert(FindingTable)
      .values({
        id,
        session_id: sessionId,
        engagement_id: engagementId,
        title: input.title,
        description: input.description,
        cvss: input.cvss,
        impact: input.impact,
        remediation: input.remediation,
        status: "open",
        // draft_vulnerability's input carries a free-text cvss/severity rating, not the
        // structured Severity enum the dashboard filters by; this is a provisional default
        // until a human triages the finding.
        severity: "medium",
      })
      .pipe(Effect.orDie)
    return id
  })
