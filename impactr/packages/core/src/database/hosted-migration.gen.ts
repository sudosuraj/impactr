import type { DatabaseMigration } from "./migration"

export const migrations = (
  await Promise.all([import("./hosted-migration/20260714100000_hosted_bootstrap")])
).map((module) => module.default) satisfies DatabaseMigration.Migration[]
