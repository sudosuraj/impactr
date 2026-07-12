export * as MemoryEmbedder from "./embedder"

import { sql } from "drizzle-orm"
import { Effect } from "effect"
import type { EffectDrizzleSqlite } from "@impactr-ai/effect-drizzle-sqlite"
import type { MemorySchema } from "./schema"
import { Identifier } from "../id/id"

type Database = EffectDrizzleSqlite.EffectSQLiteDatabase

/**
 * Indexes a memory entry into the per-project FTS5 store.
 *
 * The FTS5 virtual table is kept in sync automatically via SQLite triggers,
 * so we only need to insert into the `memory_entry` table.
 */
export const index = (
  db: Database,
  entry: {
    readonly projectId: string
    readonly sessionId?: string
    readonly type: MemorySchema.EntryType
    readonly content: string
    readonly metadata?: Record<string, unknown>
  },
) =>
  Effect.gen(function* () {
    const id = Identifier.create("mem", "ascending")
    yield* db.run(sql`
      INSERT INTO memory_entry (id, project_id, session_id, type, content, metadata, time_created)
      VALUES (
        ${id},
        ${entry.projectId},
        ${entry.sessionId ?? null},
        ${entry.type},
        ${entry.content},
        ${entry.metadata ? JSON.stringify(entry.metadata) : null},
        ${Date.now()}
      )
    `)
    return id
  })

/**
 * Indexes a compaction summary from a completed session.
 * Called as a background job after session compaction finishes.
 */
export const indexCompactionSummary = (
  db: Database,
  input: {
    readonly projectId: string
    readonly sessionId: string
    readonly summary: string
  },
) =>
  index(db, {
    projectId: input.projectId,
    sessionId: input.sessionId,
    type: "compaction_summary",
    content: input.summary,
  })

/**
 * Indexes a file's AST signature (function names, class names, type names + path).
 */
export const indexFileSignature = (
  db: Database,
  input: {
    readonly projectId: string
    readonly filePath: string
    readonly signatures: readonly string[]
  },
) =>
  index(db, {
    projectId: input.projectId,
    type: "file_signature",
    content: `${input.filePath}\n${input.signatures.join("\n")}`,
    metadata: { filePath: input.filePath },
  })

/**
 * Removes all memory entries for a project.
 */
export const clearProject = (db: Database, projectId: string) =>
  db.run(sql`DELETE FROM memory_entry WHERE project_id = ${projectId}`)

/**
 * Removes stale file signatures for a project (e.g., after reindex).
 */
export const clearFileSignatures = (db: Database, projectId: string) =>
  db.run(sql`DELETE FROM memory_entry WHERE project_id = ${projectId} AND type = 'file_signature'`)
