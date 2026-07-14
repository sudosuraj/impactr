import { sqliteTable, text, primaryKey } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../database/schema.sql"
import type { OrganizationSchema } from "./schema"

export const OrganizationTable = sqliteTable("organization", {
  id: text().$type<OrganizationSchema.ID>().primaryKey(),
  name: text().notNull(),
  slug: text().notNull().unique(),
  ...Timestamps,
})

export const UserTable = sqliteTable("user", {
  id: text().$type<OrganizationSchema.UserID>().primaryKey(),
  email: text().notNull().unique(),
  name: text().notNull(),
  // Bun.password hash (argon2id). Never exposed via @impactr-ai/schema/user's public Info type.
  password_hash: text().notNull(),
  ...Timestamps,
})

export const MembershipTable = sqliteTable(
  "membership",
  {
    organization_id: text()
      .$type<OrganizationSchema.ID>()
      .notNull()
      .references(() => OrganizationTable.id, { onDelete: "cascade" }),
    user_id: text()
      .$type<OrganizationSchema.UserID>()
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    role: text().$type<OrganizationSchema.Role>().notNull(),
    ...Timestamps,
  },
  (table) => [primaryKey({ columns: [table.organization_id, table.user_id] })],
)
