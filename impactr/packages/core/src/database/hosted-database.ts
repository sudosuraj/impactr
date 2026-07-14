export * as HostedDatabase from "./hosted-database"

import { EffectDrizzleSqlite } from "@impactr-ai/effect-drizzle-sqlite"
import { Config, ConfigProvider, Context, Effect, Layer, Option } from "effect"
import * as LibsqlClient from "./sqlite.libsql"
import { DatabaseMigration } from "./migration"
import { migrations } from "./hosted-migration.gen"
import { makeGlobalNode } from "../effect/app-node"

const makeDatabase = EffectDrizzleSqlite.makeWithDefaults()
export type DatabaseShape = Effect.Success<typeof makeDatabase>

export interface Interface {
  /**
   * `None` when no hosted DB is configured (no DATABASE_URL) — the default for local,
   * offline, single-user runs. Callers fall back to the local per-machine Database in
   * that case rather than failing.
   */
  readonly db: Option.Option<DatabaseShape>
}

export class Service extends Context.Service<Service, Interface>()("@impactr-ai/core/database/HostedDatabase") {}

const config = Config.all({
  url: Config.nonEmptyString("DATABASE_URL"),
  authToken: Config.nonEmptyString("DATABASE_AUTH_TOKEN").pipe(Config.option),
}).pipe(Config.option)

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const settings = yield* config.parse(ConfigProvider.fromEnv())

    if (Option.isNone(settings)) return { db: Option.none() }

    const { url, authToken } = settings.value
    const db = yield* makeDatabase.pipe(
      Effect.provide(LibsqlClient.layer({ url, authToken: Option.getOrUndefined(authToken) })),
    )
    yield* db.run("PRAGMA foreign_keys = ON")
    yield* DatabaseMigration.applyOnly(db, migrations)

    return { db: Option.some(db) }
  }).pipe(Effect.orDie),
)

export const node = makeGlobalNode({ service: Service, layer, deps: [] })
