import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../database/schema.sql"
import { directoryColumn } from "../database/path"
import type { EngagementSchema } from "./schema"

/**
 * Local (non-hosted) engagement authorization record — the offline twin of the hosted
 * `engagement` table. It is a persisted, auditable, revocable scope authorization for a
 * single machine, written ONLY by an explicit operator action (the `engagement authorize`
 * command), never by an agent. `get_scope` reads it so agents have a real authorization
 * record to work against in local mode, instead of the operator having no way to declare
 * authorized scope offline.
 */
export const EngagementLocalTable = sqliteTable("engagement_local", {
  id: text().$type<EngagementSchema.ID>().primaryKey(),
  name: text().notNull(),
  status: text().$type<EngagementSchema.Status>().notNull(),
  scope: text({ mode: "json" }).notNull().$type<EngagementSchema.Scope>(),
  /**
   * The directory the operator authorized this scope from (their cwd at `engagement
   * authorize` time), normalized the same way as session.directory. A local session
   * only inherits engagements authorized for its own directory, so a scope authorized
   * for one project can't leak into an unrelated session/project on the same machine.
   */
  directory: directoryColumn(),
  /** Free-text operator attestation captured at authorize time (who/authorization ref). */
  authorized_by: text(),
  authorized_at: integer(),
  ...Timestamps,
})
