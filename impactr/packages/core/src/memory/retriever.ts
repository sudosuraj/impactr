export * as MemoryRetriever from "./retriever"

import { sql } from "drizzle-orm"
import { Effect } from "effect"
import type { EffectDrizzleSqlite } from "@impactr-ai/effect-drizzle-sqlite"
import type { MemorySchema } from "./schema"

type Database = EffectDrizzleSqlite.EffectSQLiteDatabase

const MAX_RESULTS = 10

export interface RetrievalResult {
  readonly id: string
  readonly type: MemorySchema.EntryType
  readonly content: string
  readonly rank: number
}

/**
 * Retrieves relevant memory entries for a given query using SQLite FTS5 BM25 ranking.
 *
 * Scoped to a single project — no cross-project memory leakage.
 */
export const retrieve = (
  db: Database,
  projectId: string,
  query: string,
  options?: { readonly limit?: number; readonly types?: readonly MemorySchema.EntryType[] },
) =>
  Effect.gen(function* () {
    const limit = options?.limit ?? MAX_RESULTS
    const sanitized = sanitizeQuery(query)
    if (!sanitized) return []

    const typeFilter =
      options?.types && options.types.length > 0
        ? sql` AND e.type IN (${sql.join(
            options.types.map((t) => sql`${t}`),
            sql`, `,
          )})`
        : sql``

    const results = yield* db.all<{
      id: string
      type: string
      content: string
      rank: number
    }>(sql`
      SELECT e.id, e.type, e.content, f.rank
      FROM memory_fts f
      JOIN memory_entry e ON e.rowid = f.rowid
      WHERE memory_fts MATCH ${sanitized}
        AND e.project_id = ${projectId}
        ${typeFilter}
      ORDER BY f.rank
      LIMIT ${limit}
    `)

    return results as RetrievalResult[]
  })

/**
 * Sanitizes user input for FTS5 query syntax.
 * Strips special characters and wraps terms for prefix matching.
 */
function sanitizeQuery(query: string): string {
  return query
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((term) => term.length > 1)
    .map((term) => `"${term}"`)
    .join(" OR ")
}
