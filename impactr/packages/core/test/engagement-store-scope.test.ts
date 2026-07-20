import { describe, expect } from "bun:test"
import { Effect, Option } from "effect"
import { Database } from "@impactr-ai/core/database/database"
import { LayerNode } from "@impactr-ai/core/effect/layer-node"
import { AppNodeBuilder } from "@impactr-ai/core/effect/app-node-builder"
import { EngagementStore, node as EngagementStoreNode } from "@impactr-ai/core/engagement/store"
import { Project } from "@impactr-ai/core/project"
import { ProjectTable } from "@impactr-ai/core/project/sql"
import { AbsolutePath } from "@impactr-ai/core/schema"
import { SessionV2 } from "@impactr-ai/core/session"
import { SessionTable } from "@impactr-ai/core/session/sql"
import { testEffect } from "./lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, EngagementStoreNode])))
const sessionID = SessionV2.ID.make("ses_set_scope_test")
const directory = "/work/acme"

const setup = Effect.gen(function* () {
  const { db } = yield* Database.Service
  yield* db
    .insert(ProjectTable)
    .values({ id: Project.ID.global, worktree: AbsolutePath.make("/project"), sandboxes: [] })
    .run()
    .pipe(Effect.orDie)
  yield* db
    .insert(SessionTable)
    .values({
      id: sessionID,
      project_id: Project.ID.global,
      slug: "scope",
      directory,
      title: "scope",
      version: "test",
    })
    .run()
    .pipe(Effect.orDie)
})

describe("set_scope mechanism (authorize → bind → resolve)", () => {
  it.effect("a fresh session resolves no scope until one is established", () =>
    Effect.gen(function* () {
      yield* setup
      const store = yield* EngagementStore.Service
      expect(Option.isNone(yield* store.resolveForSession(sessionID))).toBe(true)
    }),
  )

  it.effect("authorizing from the operator's target and binding makes get_scope resolve it", () =>
    Effect.gen(function* () {
      yield* setup
      const store = yield* EngagementStore.Service

      // What set_scope does when the operator states a target in their prompt:
      const engagement = yield* store.authorize({
        name: "Pentest: acme.com",
        target: "acme.com",
        scope: "*.acme.com",
        exclusions: ["admin.acme.com"],
        directory,
      })
      yield* store.bindSession(sessionID, engagement.id)

      // What get_scope reads afterward:
      const resolved = yield* store.resolveForSession(sessionID)
      expect(Option.isSome(resolved)).toBe(true)
      const value = Option.getOrThrow(resolved)
      expect(value.status).toBe("authorized")
      expect(value.scope.target.name).toBe("acme.com")
      expect(value.scope.target.scope).toBe("*.acme.com")
      expect(value.scope.target.exclusions).toEqual(["admin.acme.com"])
    }),
  )

  it.effect("a revoked binding stops resolving — scope is genuinely withdrawable", () =>
    Effect.gen(function* () {
      yield* setup
      const store = yield* EngagementStore.Service
      const engagement = yield* store.authorize({
        name: "Pentest: acme.com",
        target: "acme.com",
        scope: "acme.com",
        directory,
      })
      yield* store.bindSession(sessionID, engagement.id)
      yield* store.revoke(engagement.id)
      expect(Option.isNone(yield* store.resolveForSession(sessionID))).toBe(true)
    }),
  )
})
