import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

// The diff that generated this migration also surfaced `engagement_local`, because the
// baseline snapshot predated that hand-written migration. That table is already created by
// 20260715120000_add_engagement_local (a bootstrap migration) and by the regenerated
// schema.gen.ts, so it is intentionally omitted here — recreating it would fail on existing
// databases. This migration adds only the new plan_objective table.
export default {
  id: "20260717084624_add_plan_objectives",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`plan_objective\` (
          \`id\` text PRIMARY KEY,
          \`session_id\` text NOT NULL,
          \`parent_id\` text,
          \`title\` text NOT NULL,
          \`rationale\` text,
          \`priority\` real NOT NULL,
          \`status\` text DEFAULT 'pending' NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_plan_objective_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`CREATE INDEX \`plan_objective_session_idx\` ON \`plan_objective\` (\`session_id\`);`)
      yield* tx.run(`CREATE INDEX \`plan_objective_parent_idx\` ON \`plan_objective\` (\`parent_id\`);`)
      yield* tx.run(
        `CREATE INDEX \`plan_objective_session_priority_idx\` ON \`plan_objective\` (\`session_id\`,\`priority\`);`,
      )
    })
  },
} satisfies DatabaseMigration.Migration
