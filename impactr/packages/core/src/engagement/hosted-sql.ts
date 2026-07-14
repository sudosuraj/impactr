import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"
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
