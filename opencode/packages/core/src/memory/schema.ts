export * as MemorySchema from "./schema"

/**
 * Memory entry types stored in the per-project FTS5 index.
 *
 * - `compaction_summary`: Session compaction summaries — captures what was done
 * - `file_signature`: AST-level file signatures (function/class/type names)
 * - `lesson`: User-defined or agent-inferred lessons learned
 * - `compaction_source`: Full history segment before compaction
 */
export type EntryType = "compaction_summary" | "file_signature" | "lesson" | "compaction_source"

export interface Entry {
  readonly id: string
  readonly projectId: string
  readonly sessionId?: string
  readonly type: EntryType
  readonly content: string
  readonly metadata?: Record<string, unknown>
  readonly timeCreated: number
}
