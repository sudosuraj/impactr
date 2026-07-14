import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260714100000_hosted_bootstrap",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`organization\` (
          \`id\` text PRIMARY KEY,
          \`name\` text NOT NULL,
          \`slug\` text NOT NULL UNIQUE,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)

      yield* tx.run(`
        CREATE TABLE \`user\` (
          \`id\` text PRIMARY KEY,
          \`email\` text NOT NULL UNIQUE,
          \`name\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)

      yield* tx.run(`
        CREATE TABLE \`membership\` (
          \`organization_id\` text NOT NULL,
          \`user_id\` text NOT NULL,
          \`role\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`membership_pk\` PRIMARY KEY(\`organization_id\`, \`user_id\`),
          CONSTRAINT \`fk_membership_organization_id_organization_id_fk\` FOREIGN KEY (\`organization_id\`) REFERENCES \`organization\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_membership_user_id_user_id_fk\` FOREIGN KEY (\`user_id\`) REFERENCES \`user\`(\`id\`) ON DELETE CASCADE
        );
      `)

      yield* tx.run(`
        CREATE TABLE \`engagement\` (
          \`id\` text PRIMARY KEY,
          \`organization_id\` text NOT NULL,
          \`name\` text NOT NULL,
          \`status\` text NOT NULL,
          \`scope\` text NOT NULL,
          \`authorized_by\` text,
          \`authorized_at\` integer,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_engagement_organization_id_organization_id_fk\` FOREIGN KEY (\`organization_id\`) REFERENCES \`organization\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_engagement_authorized_by_user_id_fk\` FOREIGN KEY (\`authorized_by\`) REFERENCES \`user\`(\`id\`) ON DELETE SET NULL
        );
      `)

      yield* tx.run(`
        CREATE TABLE \`asm_asset\` (
          \`id\` text PRIMARY KEY,
          \`engagement_id\` text NOT NULL,
          \`type\` text NOT NULL,
          \`value\` text NOT NULL,
          \`attributes\` text NOT NULL,
          \`discovered_at\` integer NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_asm_asset_engagement_id_engagement_id_fk\` FOREIGN KEY (\`engagement_id\`) REFERENCES \`engagement\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`CREATE INDEX \`asm_asset_engagement_idx\` ON \`asm_asset\` (\`engagement_id\`);`)

      yield* tx.run(`
        CREATE TABLE \`finding\` (
          \`id\` text PRIMARY KEY,
          \`session_id\` text NOT NULL,
          \`engagement_id\` text NOT NULL,
          \`title\` text NOT NULL,
          \`description\` text NOT NULL,
          \`cvss\` text NOT NULL,
          \`impact\` text NOT NULL,
          \`remediation\` text NOT NULL,
          \`status\` text NOT NULL,
          \`severity\` text NOT NULL,
          \`assigned_to\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_finding_engagement_id_engagement_id_fk\` FOREIGN KEY (\`engagement_id\`) REFERENCES \`engagement\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_finding_assigned_to_user_id_fk\` FOREIGN KEY (\`assigned_to\`) REFERENCES \`user\`(\`id\`) ON DELETE SET NULL
        );
      `)
      yield* tx.run(`CREATE INDEX \`finding_session_idx\` ON \`finding\` (\`session_id\`);`)
      yield* tx.run(`CREATE INDEX \`finding_engagement_idx\` ON \`finding\` (\`engagement_id\`);`)

      yield* tx.run(`
        CREATE TABLE \`attack_graph_node\` (
          \`engagement_id\` text NOT NULL,
          \`session_id\` text NOT NULL,
          \`id\` text NOT NULL,
          \`type\` text NOT NULL,
          \`label\` text NOT NULL,
          \`attributes\` text NOT NULL,
          \`status\` text NOT NULL,
          \`discovered_at\` integer NOT NULL,
          \`loop_count\` integer DEFAULT 0 NOT NULL,
          CONSTRAINT \`hosted_attack_graph_node_pk\` PRIMARY KEY(\`engagement_id\`, \`id\`),
          CONSTRAINT \`fk_attack_graph_node_engagement_id_engagement_id_fk\` FOREIGN KEY (\`engagement_id\`) REFERENCES \`engagement\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`CREATE INDEX \`hosted_attack_graph_node_engagement_idx\` ON \`attack_graph_node\` (\`engagement_id\`);`)
      yield* tx.run(`CREATE INDEX \`hosted_attack_graph_node_session_idx\` ON \`attack_graph_node\` (\`session_id\`);`)

      yield* tx.run(`
        CREATE TABLE \`attack_graph_edge\` (
          \`engagement_id\` text NOT NULL,
          \`session_id\` text NOT NULL,
          \`source\` text NOT NULL,
          \`target\` text NOT NULL,
          \`relation\` text NOT NULL,
          \`attributes\` text NOT NULL,
          CONSTRAINT \`hosted_attack_graph_edge_pk\` PRIMARY KEY(\`engagement_id\`, \`source\`, \`target\`, \`relation\`),
          CONSTRAINT \`fk_attack_graph_edge_engagement_id_engagement_id_fk\` FOREIGN KEY (\`engagement_id\`) REFERENCES \`engagement\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`CREATE INDEX \`hosted_attack_graph_edge_engagement_idx\` ON \`attack_graph_edge\` (\`engagement_id\`);`)

      yield* tx.run(`
        CREATE TABLE \`graph_node\` (
          \`id\` text PRIMARY KEY,
          \`engagement_id\` text NOT NULL,
          \`session_id\` text NOT NULL,
          \`type\` text NOT NULL,
          \`data\` text NOT NULL,
          \`novelty_score\` real NOT NULL,
          \`confidence_score\` real NOT NULL,
          \`impact_score\` real NOT NULL,
          \`fingerprint\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_graph_node_engagement_id_engagement_id_fk\` FOREIGN KEY (\`engagement_id\`) REFERENCES \`engagement\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`CREATE INDEX \`hosted_graph_node_engagement_idx\` ON \`graph_node\` (\`engagement_id\`);`)
      yield* tx.run(`CREATE INDEX \`hosted_graph_node_type_idx\` ON \`graph_node\` (\`type\`);`)
      yield* tx.run(
        `CREATE INDEX \`hosted_graph_node_engagement_fingerprint_idx\` ON \`graph_node\` (\`engagement_id\`, \`fingerprint\`);`,
      )

      yield* tx.run(`
        CREATE TABLE \`graph_edge\` (
          \`source_id\` text NOT NULL,
          \`target_id\` text NOT NULL,
          \`relation_type\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_graph_edge_source_id_graph_node_id_fk\` FOREIGN KEY (\`source_id\`) REFERENCES \`graph_node\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_graph_edge_target_id_graph_node_id_fk\` FOREIGN KEY (\`target_id\`) REFERENCES \`graph_node\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`CREATE INDEX \`hosted_graph_edge_source_idx\` ON \`graph_edge\` (\`source_id\`);`)
      yield* tx.run(`CREATE INDEX \`hosted_graph_edge_target_idx\` ON \`graph_edge\` (\`target_id\`);`)

      yield* tx.run(`
        CREATE TABLE \`hypothesis_queue\` (
          \`id\` text PRIMARY KEY,
          \`engagement_id\` text NOT NULL,
          \`session_id\` text NOT NULL,
          \`source_finding_id\` text NOT NULL,
          \`description\` text NOT NULL,
          \`priority\` real NOT NULL,
          \`status\` text DEFAULT 'pending' NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_hypothesis_queue_engagement_id_engagement_id_fk\` FOREIGN KEY (\`engagement_id\`) REFERENCES \`engagement\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(
        `CREATE INDEX \`hosted_hypothesis_queue_engagement_idx\` ON \`hypothesis_queue\` (\`engagement_id\`);`,
      )
      yield* tx.run(`CREATE INDEX \`hosted_hypothesis_queue_status_idx\` ON \`hypothesis_queue\` (\`status\`);`)
      yield* tx.run(
        `CREATE INDEX \`hosted_hypothesis_queue_engagement_status_priority_idx\` ON \`hypothesis_queue\` (\`engagement_id\`, \`status\`, \`priority\`);`,
      )
    })
  },
} satisfies DatabaseMigration.Migration
