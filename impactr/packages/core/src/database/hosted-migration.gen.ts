import type { DatabaseMigration } from "./migration"

export const migrations = (
  await Promise.all([
    import("./hosted-migration/20260714100000_hosted_bootstrap"),
    import("./hosted-migration/20260714120000_add_user_password_hash"),
    import("./hosted-migration/20260714130000_add_engagement_audit_log"),
  ])
).map((module) => module.default) satisfies DatabaseMigration.Migration[]
