import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { Database } from "@impactr-ai/core/database/database"
import { LayerNode } from "@impactr-ai/core/effect/layer-node"
import { AppNodeBuilder } from "@impactr-ai/core/effect/app-node-builder"
import { Plan, node as PlanNode } from "@impactr-ai/core/session/plan"
import { Project } from "@impactr-ai/core/project"
import { ProjectTable } from "@impactr-ai/core/project/sql"
import { AbsolutePath } from "@impactr-ai/core/schema"
import { SessionV2 } from "@impactr-ai/core/session"
import { SessionTable } from "@impactr-ai/core/session/sql"
import { testEffect } from "./lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, PlanNode])))
const sessionID = SessionV2.ID.make("ses_plan_test")

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
      slug: "plan",
      directory: "/project",
      title: "plan",
      version: "test",
    })
    .run()
    .pipe(Effect.orDie)
})

describe("Plan", () => {
  it.effect("stores objectives and returns them highest-priority first", () =>
    Effect.gen(function* () {
      yield* setup
      const plan = yield* Plan
      yield* plan.add(sessionID, { title: "Map the marketing site", priority: 0.2 })
      yield* plan.add(sessionID, { title: "Test the login flow", priority: 0.9, rationale: "auth is where impact lives" })
      const objectives = yield* plan.get(sessionID)
      expect(objectives.map((o) => o.title)).toEqual(["Test the login flow", "Map the marketing site"])
      expect(objectives[0].rationale).toBe("auth is where impact lives")
      expect(objectives[0].status).toBe("pending")
    }),
  )

  it.effect("nests objectives under a parent to form the hierarchy", () =>
    Effect.gen(function* () {
      yield* setup
      const plan = yield* Plan
      const apiId = yield* plan.add(sessionID, { title: "Attack the API", priority: 0.8 })
      const childId = yield* plan.add(sessionID, { parentId: apiId, title: "Test BOLA on /users/:id", priority: 0.85 })
      const objectives = yield* plan.get(sessionID)
      const child = objectives.find((o) => o.id === childId)
      expect(child?.parentId).toBe(apiId)
    }),
  )

  it.effect("re-adding a live objective sharpens it instead of duplicating", () =>
    Effect.gen(function* () {
      yield* setup
      const plan = yield* Plan
      const first = yield* plan.add(sessionID, { title: "Probe file upload", priority: 0.5 })
      const again = yield* plan.add(sessionID, { title: "Probe file upload", priority: 0.9, rationale: "found an unauthenticated upload" })
      expect(again).toBe(first)
      const objectives = yield* plan.get(sessionID)
      expect(objectives).toHaveLength(1)
      // Priority rises to the stronger estimate; rationale refreshes.
      expect(objectives[0].priority).toBeCloseTo(0.9)
      expect(objectives[0].rationale).toBe("found an unauthenticated upload")
    }),
  )

  it.effect("revises status and reports whether the objective existed", () =>
    Effect.gen(function* () {
      yield* setup
      const plan = yield* Plan
      const id = yield* plan.add(sessionID, { title: "Enumerate subdomains", priority: 0.6 })
      const revised = yield* plan.revise(sessionID, id, { status: "done" })
      const missing = yield* plan.revise(sessionID, "nonexistent", { status: "done" })
      expect(revised).toBe(true)
      expect(missing).toBe(false)
      const objectives = yield* plan.get(sessionID)
      expect(objectives[0].status).toBe("done")
    }),
  )

  it.effect("a terminal objective does not block re-planning the same title", () =>
    Effect.gen(function* () {
      yield* setup
      const plan = yield* Plan
      const first = yield* plan.add(sessionID, { title: "Check for exposed .git", priority: 0.7 })
      yield* plan.revise(sessionID, first, { status: "abandoned" })
      const second = yield* plan.add(sessionID, { title: "Check for exposed .git", priority: 0.7 })
      expect(second).not.toBe(first)
      const objectives = yield* plan.get(sessionID)
      expect(objectives).toHaveLength(2)
    }),
  )
})
