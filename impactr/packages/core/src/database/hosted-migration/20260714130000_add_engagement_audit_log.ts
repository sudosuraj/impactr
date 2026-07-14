import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260714130000_add_engagement_audit_log",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`engagement_audit_log\` (
          \`id\` text PRIMARY KEY,
          \`engagement_id\` text NOT NULL,
          \`actor_user_id\` text,
          \`action\` text NOT NULL,
          \`details\` text,
          \`time_created\` integer NOT NULL,
          CONSTRAINT \`fk_engagement_audit_log_engagement_id_engagement_id_fk\` FOREIGN KEY (\`engagement_id\`) REFERENCES \`engagement\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_engagement_audit_log_actor_user_id_user_id_fk\` FOREIGN KEY (\`actor_user_id\`) REFERENCES \`user\`(\`id\`) ON DELETE SET NULL
        );
      `)
      yield* tx.run(
        `CREATE INDEX \`engagement_audit_log_engagement_idx\` ON \`engagement_audit_log\` (\`engagement_id\`);`,
      )
    })
  },
} satisfies DatabaseMigration.Migration
