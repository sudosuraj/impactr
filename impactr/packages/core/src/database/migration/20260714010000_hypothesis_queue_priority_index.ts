import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260714010000_hypothesis_queue_priority_index",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(
        `CREATE INDEX \`hypothesis_queue_session_status_priority_idx\` ON \`hypothesis_queue\` (\`session_id\`,\`status\`,\`priority\`);`,
      )
    })
  },
} satisfies DatabaseMigration.Migration
