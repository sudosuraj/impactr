import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260715120000_add_engagement_local",
  // Run on fresh installs too: the baseline schema.gen.ts does not contain this table,
  // and the bootstrap path records non-bootstrap migrations as complete without running
  // them — so without this flag a fresh database would never create engagement_local.
  // `IF NOT EXISTS` keeps this idempotent: if schema.gen.ts is later regenerated (it would
  // then include engagement_local and be created by the baseline apply), this bootstrap run
  // becomes a no-op instead of failing on a duplicate table. Proper long-term resolution:
  // regenerate schema.gen.ts to include this table and drop the `bootstrap` flag.
  bootstrap: true,
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE IF NOT EXISTS \`engagement_local\` (
          \`id\` text PRIMARY KEY,
          \`name\` text NOT NULL,
          \`status\` text NOT NULL,
          \`scope\` text NOT NULL,
          \`directory\` text,
          \`authorized_by\` text,
          \`authorized_at\` integer,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
    })
  },
} satisfies DatabaseMigration.Migration
