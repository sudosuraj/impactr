import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260714120000_add_user_password_hash",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`user\` ADD \`password_hash\` text NOT NULL DEFAULT '';`)
    })
  },
} satisfies DatabaseMigration.Migration
