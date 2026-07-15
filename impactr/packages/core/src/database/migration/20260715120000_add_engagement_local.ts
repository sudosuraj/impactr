import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260715120000_add_engagement_local",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`engagement_local\` (
          \`id\` text PRIMARY KEY,
          \`name\` text NOT NULL,
          \`status\` text NOT NULL,
          \`scope\` text NOT NULL,
          \`authorized_by\` text,
          \`authorized_at\` integer,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
    })
  },
} satisfies DatabaseMigration.Migration
