import { sqliteTable, text, index } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../database/schema.sql"
import { EngagementTable } from "../engagement/hosted-sql"
import { UserTable } from "../organization/hosted-sql"
import type { EngagementSchema } from "../engagement/schema"
import type { OrganizationSchema } from "../organization/schema"
import type { SessionSchema } from "../session/schema"
import type { FindingSchema } from "./schema"

/**
 * Lives in the hosted database (see database/hosted-database.ts). `session_id` correlates
 * back to the session that authored the finding, but session lives in the separate local
 * per-machine database, so it is a plain indexed column rather than a SQL foreign key —
 * cross-database referential integrity is enforced at the application layer only.
 */
export const FindingTable = sqliteTable(
  "finding",
  {
    id: text().$type<FindingSchema.ID>().primaryKey(),
    session_id: text().$type<SessionSchema.ID>().notNull(),
    engagement_id: text()
      .$type<EngagementSchema.ID>()
      .notNull()
      .references(() => EngagementTable.id, { onDelete: "cascade" }),
    title: text().notNull(),
    description: text().notNull(),
    cvss: text().notNull(),
    impact: text().notNull(),
    remediation: text().notNull(),
    status: text().$type<FindingSchema.Status>().notNull(),
    severity: text().$type<FindingSchema.Severity>().notNull(),
    assigned_to: text()
      .$type<OrganizationSchema.UserID>()
      .references(() => UserTable.id, { onDelete: "set null" }),
    ...Timestamps,
  },
  (table) => [
    index("finding_session_idx").on(table.session_id),
    index("finding_engagement_idx").on(table.engagement_id),
  ],
)
