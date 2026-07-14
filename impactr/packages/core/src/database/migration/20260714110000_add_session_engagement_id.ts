import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260714110000_add_session_engagement_id",
  up(tx) {
    return Effect.gen(function* () {
      // Not a SQL foreign key: engagement lives in the separate hosted database.
      yield* tx.run(`ALTER TABLE \`session\` ADD \`engagement_id\` text;`)
    })
  },
} satisfies DatabaseMigration.Migration
