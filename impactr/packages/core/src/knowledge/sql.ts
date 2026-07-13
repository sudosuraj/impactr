import { sqliteTable, text, index, real } from "drizzle-orm/sqlite-core"
import { SessionTable } from "../session/sql"
import { Timestamps } from "../database/schema.sql"
import type { SessionSchema } from "../session/schema"

export const GraphNodeTable = sqliteTable(
  "graph_node",
  {
    id: text().primaryKey(),
    session_id: text()
      .$type<SessionSchema.ID>()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    type: text().notNull(),
    data: text({ mode: "json" }).notNull().$type<unknown>(),
    novelty_score: real().notNull(),
    confidence_score: real().notNull(),
    impact_score: real().notNull(),
    ...Timestamps,
  },
  (table) => [
    index("graph_node_session_idx").on(table.session_id),
    index("graph_node_type_idx").on(table.type),
  ],
)

export const GraphEdgeTable = sqliteTable(
  "graph_edge",
  {
    source_id: text()
      .notNull()
      .references(() => GraphNodeTable.id, { onDelete: "cascade" }),
    target_id: text()
      .notNull()
      .references(() => GraphNodeTable.id, { onDelete: "cascade" }),
    relation_type: text().notNull(),
    ...Timestamps,
  },
  (table) => [
    index("graph_edge_source_idx").on(table.source_id),
    index("graph_edge_target_idx").on(table.target_id),
  ],
)
