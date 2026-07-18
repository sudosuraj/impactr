import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { Database } from "@impactr-ai/core/database/database"
import { LayerNode } from "@impactr-ai/core/effect/layer-node"
import { AppNodeBuilder } from "@impactr-ai/core/effect/app-node-builder"
import { Plan, node as PlanNode, renderPlan, type Objective } from "@impactr-ai/core/session/plan"
import { playbooks, playbookNames } from "@impactr-ai/core/session/playbook"
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

  it.effect("seeds a playbook into a prioritized hierarchy", () =>
    Effect.gen(function* () {
      yield* setup
      const plan = yield* Plan
      const count = yield* plan.seed(sessionID, playbooks["api"])
      expect(count).toBeGreaterThan(0)
      const objectives = yield* plan.get(sessionID)
      expect(objectives).toHaveLength(count)
      // Top-level objectives exist and the hierarchy is preserved (some objective has a parent).
      expect(objectives.some((o) => o.parentId === undefined)).toBe(true)
      expect(objectives.some((o) => o.parentId !== undefined)).toBe(true)
      // The API playbook must rank object-level authorization (BOLA) as its top objective.
      const roots = objectives.filter((o) => o.parentId === undefined).sort((a, b) => b.priority - a.priority)
      expect(roots[0].title).toContain("object-level authorization")
    }),
  )

  it.effect("re-seeding sharpens the plan instead of duplicating it", () =>
    Effect.gen(function* () {
      yield* setup
      const plan = yield* Plan
      const first = yield* plan.seed(sessionID, playbooks["web-app"])
      const afterFirst = (yield* plan.get(sessionID)).length
      yield* plan.seed(sessionID, playbooks["web-app"])
      const afterSecond = (yield* plan.get(sessionID)).length
      expect(afterFirst).toBe(first)
      // Seeding the same playbook again dedupes — no growth.
      expect(afterSecond).toBe(afterFirst)
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

describe("renderPlan", () => {
  // The engine's idle-continuation relies on "" for an empty plan so it can skip injecting it.
  test("renders an empty plan as the empty string", () => {
    expect(renderPlan([])).toBe("")
  })

  test("indents children under their parent", () => {
    const objectives: Objective[] = [
      { id: "api", parentId: undefined, title: "Attack the API", rationale: undefined, priority: 0.8, status: "active" },
      { id: "bola", parentId: "api", title: "Test BOLA", rationale: "top API bug", priority: 0.85, status: "pending" },
    ]
    const rendered = renderPlan(objectives)
    expect(rendered).toContain("◐ [0.80] Attack the API (id:api)")
    expect(rendered).toContain("  ○ [0.85] Test BOLA (id:bola) — top API bug")
  })

  test("surfaces an orphaned objective at the root instead of dropping it", () => {
    const objectives: Objective[] = [
      { id: "child", parentId: "missing", title: "Orphaned lead", rationale: undefined, priority: 0.4, status: "pending" },
    ]
    expect(renderPlan(objectives)).toContain("○ [0.40] Orphaned lead (id:child)")
  })

  test("renders the whole subtree under an orphaned parent, not just the orphan", () => {
    // An objective nested under an orphan (bogus parentId) must not vanish from the digest.
    const objectives: Objective[] = [
      { id: "orphan", parentId: "missing", title: "Orphan root", rationale: undefined, priority: 0.5, status: "pending" },
      { id: "grandchild", parentId: "orphan", title: "Nested under orphan", rationale: undefined, priority: 0.6, status: "pending" },
    ]
    const rendered = renderPlan(objectives)
    expect(rendered).toContain("Orphan root (id:orphan)")
    expect(rendered).toContain("Nested under orphan (id:grandchild)")
  })
})

describe("playbooks", () => {
  test("every playbook has objectives with valid priorities", () => {
    expect(playbookNames.length).toBeGreaterThan(0)
    const walk = (nodes: ReadonlyArray<{ priority: number; title: string; children?: ReadonlyArray<any> }>) => {
      for (const n of nodes) {
        expect(n.title.length).toBeGreaterThan(0)
        expect(n.priority).toBeGreaterThanOrEqual(0)
        expect(n.priority).toBeLessThanOrEqual(1)
        if (n.children) walk(n.children)
      }
    }
    for (const name of playbookNames) {
      expect(playbooks[name].length).toBeGreaterThan(0)
      walk(playbooks[name])
    }
  })
})
