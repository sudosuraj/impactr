export * as EngagementStore from "./store"

import { Clock, Context, Effect, Layer, Option } from "effect"
import { desc, eq, inArray } from "drizzle-orm"
import { Database } from "../database/database"
import { makeGlobalNode } from "../effect/app-node"
import { Identifier } from "../id/id"
import { EngagementLocalTable } from "./sql"
import { SessionTable } from "../session/sql"
import type { EngagementSchema } from "./schema"
import type { SessionSchema } from "../session/schema"

/** The fields get_scope and the CLI need — a subset of the persisted row. */
export interface LocalEngagement {
  readonly id: EngagementSchema.ID
  readonly name: string
  readonly status: EngagementSchema.Status
  readonly scope: EngagementSchema.Scope
}

export interface AuthorizeInput {
  readonly name: string
  readonly target: string
  readonly scope: string
  readonly exclusions?: readonly string[]
  /** Free-text operator attestation (who authorized / authorization reference). */
  readonly authorizedBy?: string
}

export interface Interface {
  /** Records an operator-authorized engagement. Only ever called from an operator action. */
  readonly authorize: (input: AuthorizeInput) => Effect.Effect<LocalEngagement>
  readonly get: (id: EngagementSchema.ID) => Effect.Effect<Option.Option<LocalEngagement>>
  /**
   * The engagement a local session should treat as authoritative: the one explicitly bound
   * to the session if any, else the most recent still-authorized engagement on this machine.
   */
  readonly resolveForSession: (sessionID: SessionSchema.ID) => Effect.Effect<Option.Option<LocalEngagement>>
  readonly bindSession: (sessionID: SessionSchema.ID, engagementID: EngagementSchema.ID) => Effect.Effect<void>
  readonly revoke: (id: EngagementSchema.ID) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@impactr-ai/core/engagement/Store") {}

const toLocal = (row: typeof EngagementLocalTable.$inferSelect): LocalEngagement => ({
  id: row.id,
  name: row.name,
  status: row.status,
  scope: row.scope,
})

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service

    const getRow = (id: EngagementSchema.ID) =>
      db.select().from(EngagementLocalTable).where(eq(EngagementLocalTable.id, id)).get().pipe(Effect.orDie)

    const latestAuthorized = () =>
      db
        .select()
        .from(EngagementLocalTable)
        .where(inArray(EngagementLocalTable.status, ["authorized", "active"] as EngagementSchema.Status[]))
        .orderBy(desc(EngagementLocalTable.time_created))
        .get()
        .pipe(Effect.orDie)

    return Service.of({
      authorize: (input) =>
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis
          const id = Identifier.create("eng", "ascending") as EngagementSchema.ID
          const scope: EngagementSchema.Scope = {
            target: {
              name: input.target,
              scope: input.scope,
              exclusions: input.exclusions ? [...input.exclusions] : [],
            },
          }
          const status: EngagementSchema.Status = "authorized"
          yield* db
            .insert(EngagementLocalTable)
            .values({
              id,
              name: input.name,
              status,
              scope,
              authorized_by: input.authorizedBy ?? null,
              authorized_at: now,
              time_created: now,
              time_updated: now,
            })
            .pipe(Effect.orDie)
          return { id, name: input.name, status, scope }
        }),

      get: (id) => getRow(id).pipe(Effect.map((row) => (row ? Option.some(toLocal(row)) : Option.none()))),

      resolveForSession: (sessionID) =>
        Effect.gen(function* () {
          const session = yield* db
            .select({ engagement_id: SessionTable.engagement_id })
            .from(SessionTable)
            .where(eq(SessionTable.id, sessionID))
            .get()
            .pipe(Effect.orDie)
          if (session?.engagement_id) {
            const bound = yield* getRow(session.engagement_id)
            if (bound) return Option.some(toLocal(bound))
          }
          const latest = yield* latestAuthorized()
          return latest ? Option.some(toLocal(latest)) : Option.none()
        }),

      bindSession: (sessionID, engagementID) =>
        db
          .update(SessionTable)
          .set({ engagement_id: engagementID })
          .where(eq(SessionTable.id, sessionID))
          .pipe(Effect.asVoid, Effect.orDie),

      revoke: (id) =>
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis
          yield* db
            .update(EngagementLocalTable)
            .set({ status: "revoked" as EngagementSchema.Status, time_updated: now })
            .where(eq(EngagementLocalTable.id, id))
            .pipe(Effect.orDie)
        }),
    })
  }),
)

export const node = makeGlobalNode({ service: Service, layer, deps: [Database.node] })
