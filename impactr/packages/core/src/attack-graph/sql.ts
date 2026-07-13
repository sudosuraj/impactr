import { sqliteTable, text, integer, index, primaryKey } from "drizzle-orm/sqlite-core"
import { SessionTable } from "../session/sql"
import type { SessionSchema } from "../session/schema"
import type { NodeType, NodeStatus, EdgeRelation } from "./schema"

export const AttackGraphNodeTable = sqliteTable(
  "attack_graph_node",
  {
    session_id: text()
      .$type<SessionSchema.ID>()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    id: text().notNull(),
    type: text().$type<NodeType>().notNull(),
    label: text().notNull(),
    attributes: text({ mode: "json" }).notNull().$type<Record<string, unknown>>(),
    status: text().$type<NodeStatus>().notNull(),
    discovered_at: integer().notNull(),
    loop_count: integer().notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.session_id, table.id] }),
    index("attack_graph_node_session_idx").on(table.session_id),
  ],
)

export const AttackGraphEdgeTable = sqliteTable(
  "attack_graph_edge",
  {
    session_id: text()
      .$type<SessionSchema.ID>()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    source: text().notNull(),
    target: text().notNull(),
    relation: text().$type<EdgeRelation>().notNull(),
    attributes: text({ mode: "json" }).notNull().$type<Record<string, unknown>>(),
  },
  (table) => [
    primaryKey({ columns: [table.session_id, table.source, table.target, table.relation] }),
    index("attack_graph_edge_session_idx").on(table.session_id),
  ],
)
