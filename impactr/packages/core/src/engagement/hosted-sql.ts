import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../database/schema.sql"
import { OrganizationTable, UserTable } from "../organization/hosted-sql"
import type { OrganizationSchema } from "../organization/schema"
import type { EngagementSchema } from "./schema"

export const EngagementTable = sqliteTable("engagement", {
  id: text().$type<EngagementSchema.ID>().primaryKey(),
  organization_id: text()
    .$type<OrganizationSchema.ID>()
    .notNull()
    .references(() => OrganizationTable.id, { onDelete: "cascade" }),
  name: text().notNull(),
  status: text().$type<EngagementSchema.Status>().notNull(),
  scope: text({ mode: "json" }).notNull().$type<EngagementSchema.Scope>(),
  authorized_by: text()
    .$type<OrganizationSchema.UserID>()
    .references(() => UserTable.id, { onDelete: "set null" }),
  authorized_at: integer(),
  ...Timestamps,
})

export const EngagementAuditLogAction = [
  "created",
  "authorized",
  "scope_changed",
  "revoked",
  "reactivated",
] as const
export type EngagementAuditLogAction = (typeof EngagementAuditLogAction)[number]

/**
 * Append-only: rows are never updated, so there's no time_updated. actor_user_id is null for
 * system-initiated entries (e.g. a migration backfill) rather than an operator action.
 */
export const EngagementAuditLogTable = sqliteTable(
  "engagement_audit_log",
  {
    id: text().primaryKey(),
    engagement_id: text()
      .$type<EngagementSchema.ID>()
      .notNull()
      .references(() => EngagementTable.id, { onDelete: "cascade" }),
    actor_user_id: text()
      .$type<OrganizationSchema.UserID>()
      .references(() => UserTable.id, { onDelete: "set null" }),
    action: text().$type<EngagementAuditLogAction>().notNull(),
    details: text({ mode: "json" }).$type<Record<string, unknown>>(),
    time_created: integer()
      .notNull()
      .$default(() => Date.now()),
  },
  (table) => [index("engagement_audit_log_engagement_idx").on(table.engagement_id)],
)
