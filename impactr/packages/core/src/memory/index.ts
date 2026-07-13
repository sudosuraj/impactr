export * as Memory from "./index"

import { makeLocationNode } from "../effect/app-node"
import { Effect, Layer, Schema } from "effect"
import { Database } from "../database/database"
import { Location } from "../location"
import { SystemContext } from "../system-context/index"
import { SystemContextRegistry } from "../system-context/registry"
import { SessionStore } from "../session/store"
import { MemoryRetriever } from "./retriever"

/**
 * Per-project persistent memory SystemContext source.
 *
 * At each Safe Provider-Turn Boundary, retrieves relevant memory entries
 * from the project's FTS5 index based on recent session context. This gives
 * the agent access to knowledge from previous sessions without consuming
 * the full token history.
 *
 * Memory is strictly per-project — no cross-project leakage.
 */

const MAX_MEMORY_CHARS = 4000

interface MemoryValue {
  readonly entries: readonly string[]
}

const MemoryCodec = Schema.toCodecJson(
  Schema.Struct({
    entries: Schema.Array(Schema.String),
  }),
)

const formatMemory = (entries: readonly string[]): string => {
  if (entries.length === 0) return ""
  return [
    "<project_memory>",
    "The following is relevant context from previous sessions in this project:",
    "",
    ...entries.map((entry, i) => `${i + 1}. ${entry}`),
    "</project_memory>",
  ].join("\n")
}

const memoryLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const location = yield* Location.Service
    const registry = yield* SystemContextRegistry.Service
    const projectId = location.project.id

    const context = SystemContext.make<MemoryValue>({
      key: SystemContext.Key.make("impactr/memory"),
      codec: MemoryCodec,
      load: Effect.gen(function* () {
        // Build a query from the project's working directory name and recent context
        // This is intentionally lightweight — we use the project name + directory as
        // the initial retrieval signal. A future improvement will extract terms from
        // the most recent user message.
        const query = location.directory.split(/[\\/]/).pop() ?? ""
        if (!query) return { entries: [] }

        const results = yield* MemoryRetriever.retrieve(db, projectId, query, {
          limit: 8,
          types: ["compaction_summary", "lesson"],
        }).pipe(Effect.catch(() => Effect.succeed([])))

        let totalChars = 0
        const selected: string[] = []
        for (const result of results) {
          if (totalChars + result.content.length > MAX_MEMORY_CHARS) break
          selected.push(result.content)
          totalChars += result.content.length
        }

        return { entries: selected }
      }),
      baseline: (value) => formatMemory(value.entries),
      update: (_previous, value) => formatMemory(value.entries),
    })

    yield* registry.register({ key: SystemContext.Key.make("impactr/memory"), load: Effect.succeed(context) })
  }),
)

export const node = makeLocationNode({
  name: "impactr-memory",
  layer: memoryLayer,
  deps: [Database.node, Location.node, SystemContextRegistry.node],
})
