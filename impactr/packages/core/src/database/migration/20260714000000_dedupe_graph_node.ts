import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260714000000_dedupe_graph_node",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`graph_node\` ADD COLUMN \`fingerprint\` text;`)
      yield* tx.run(
        `CREATE INDEX \`graph_node_session_fingerprint_idx\` ON \`graph_node\` (\`session_id\`,\`fingerprint\`);`,
      )
    })
  },
} satisfies DatabaseMigration.Migration
