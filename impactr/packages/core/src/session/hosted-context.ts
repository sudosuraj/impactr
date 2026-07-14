export * as HostedContext from "./hosted-context"

import { Context, Effect, Layer, Option } from "effect"
import { eq } from "drizzle-orm"
import { Database } from "../database/database"
import { HostedDatabase } from "../database/hosted-database"
import { makeGlobalNode } from "../effect/app-node"
import { SessionTable } from "./sql"
import type { SessionSchema } from "./schema"
import type { EngagementSchema } from "../engagement/schema"

export interface Resolved {
  readonly engagementID: EngagementSchema.ID
  readonly db: HostedDatabase.DatabaseShape
}

export interface Interface {
  /**
   * `Some` only when the session belongs to an engagement AND a hosted database is
   * configured — the single condition the four pentest tools branch on. `None` covers
   * pure local/offline sessions and hosted-config-absent runs identically, so callers
   * don't need to distinguish "no engagement" from "no hosted DB".
   */
  readonly resolve: (sessionID: SessionSchema.ID) => Effect.Effect<Option.Option<Resolved>>
}

export class Service extends Context.Service<Service, Interface>()("@impactr-ai/core/session/HostedContext") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db: localDb } = yield* Database.Service
    const hosted = yield* HostedDatabase.Service

    return Service.of({
      resolve: (sessionID) =>
        Effect.gen(function* () {
          if (Option.isNone(hosted.db)) return Option.none()

          const session = yield* localDb
            .select({ engagement_id: SessionTable.engagement_id })
            .from(SessionTable)
            .where(eq(SessionTable.id, sessionID))
            .get()
            .pipe(Effect.orDie)

          if (!session?.engagement_id) return Option.none()

          return Option.some({ engagementID: session.engagement_id, db: hosted.db.value })
        }),
    })
  }),
)

export const node = makeGlobalNode({ service: Service, layer, deps: [Database.node, HostedDatabase.node] })
