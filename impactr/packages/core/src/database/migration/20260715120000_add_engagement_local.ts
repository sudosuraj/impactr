import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260715120000_add_engagement_local",
  // Run on fresh installs too: the baseline schema.gen.ts does not contain this table,
  // and the bootstrap path records non-bootstrap migrations as complete without running
  // them — so without this flag a fresh database would never create engagement_local.
  bootstrap: true,
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
