import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260708120000_add_memory_fts",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`memory_entry\` (
          \`id\` text PRIMARY KEY,
          \`project_id\` text NOT NULL,
          \`session_id\` text,
          \`type\` text NOT NULL,
          \`content\` text NOT NULL,
          \`metadata\` text,
          \`time_created\` integer NOT NULL,
          CONSTRAINT \`fk_memory_entry_project_id_project_id_fk\` FOREIGN KEY (\`project_id\`) REFERENCES \`project\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE VIRTUAL TABLE \`memory_fts\` USING fts5(
          content,
          content=\`memory_entry\`,
          content_rowid=\`rowid\`,
          tokenize='porter unicode61'
        );
      `)
      yield* tx.run(`
        CREATE TRIGGER \`memory_entry_ai\` AFTER INSERT ON \`memory_entry\` BEGIN
          INSERT INTO \`memory_fts\`(rowid, content) VALUES (new.rowid, new.content);
        END;
      `)
      yield* tx.run(`
        CREATE TRIGGER \`memory_entry_ad\` AFTER DELETE ON \`memory_entry\` BEGIN
          INSERT INTO \`memory_fts\`(\`memory_fts\`, rowid, content) VALUES ('delete', old.rowid, old.content);
        END;
      `)
      yield* tx.run(`
        CREATE TRIGGER \`memory_entry_au\` AFTER UPDATE ON \`memory_entry\` BEGIN
          INSERT INTO \`memory_fts\`(\`memory_fts\`, rowid, content) VALUES ('delete', old.rowid, old.content);
          INSERT INTO \`memory_fts\`(rowid, content) VALUES (new.rowid, new.content);
        END;
      `)
      yield* tx.run(`
        CREATE INDEX \`idx_memory_entry_project_id\` ON \`memory_entry\`(\`project_id\`);
      `)
      yield* tx.run(`
        CREATE INDEX \`idx_memory_entry_type\` ON \`memory_entry\`(\`type\`);
      `)
    })
  },
} satisfies DatabaseMigration.Migration
