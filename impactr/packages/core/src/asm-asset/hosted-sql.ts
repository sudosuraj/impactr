import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../database/schema.sql"
import { EngagementTable } from "../engagement/hosted-sql"
import type { EngagementSchema } from "../engagement/schema"
import type { AsmAssetSchema } from "./schema"

/** Lives in the hosted database (see database/hosted-database.ts). */
export const AsmAssetTable = sqliteTable(
  "asm_asset",
  {
    id: text().$type<AsmAssetSchema.ID>().primaryKey(),
    engagement_id: text()
      .$type<EngagementSchema.ID>()
      .notNull()
      .references(() => EngagementTable.id, { onDelete: "cascade" }),
    type: text().$type<AsmAssetSchema.Type>().notNull(),
    value: text().notNull(),
    attributes: text({ mode: "json" }).notNull().$type<Record<string, unknown>>(),
    discovered_at: integer().notNull(),
    ...Timestamps,
  },
  (table) => [index("asm_asset_engagement_idx").on(table.engagement_id)],
)
