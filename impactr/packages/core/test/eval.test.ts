import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { Database } from "@impactr-ai/core/database/database"
import { LayerNode } from "@impactr-ai/core/effect/layer-node"
import { AppNodeBuilder } from "@impactr-ai/core/effect/app-node-builder"
import { EvalHarness } from "@impactr-ai/core/eval/harness"
import { examples } from "@impactr-ai/core/eval/suites"
import { KnowledgeGraph, node as KnowledgeGraphNode } from "@impactr-ai/core/knowledge/graph"
import { Project } from "@impactr-ai/core/project"
import { ProjectTable } from "@impactr-ai/core/project/sql"
import { AbsolutePath } from "@impactr-ai/core/schema"
import { SessionV2 } from "@impactr-ai/core/session"
import { SessionTable } from "@impactr-ai/core/session/sql"
import { testEffect } from "./lib/effect"

const idorCase: EvalHarness.EvalCase = {
  id: "case-1",
  name: "IDOR",
  category: "web",
  expected: [
    { type: "vulnerability", contains: "idor", weight: 2 },
    { type: "endpoint", contains: "/api/orders" },
  ],
}

describe("EvalHarness.scoreCase", () => {
  test("full recall passes with score 1", () => {
    const result = EvalHarness.scoreCase(idorCase, [
      { type: "vulnerability", data: { class: "IDOR", where: "/api/orders/1" } },
      { type: "endpoint", data: { path: "/api/orders" } },
    ])
    expect(result.passed).toBe(true)
    expect(result.score).toBe(1)
    expect(result.missing).toHaveLength(0)
  })

  test("partial recall is weighted, not pass/fail", () => {
    // Found the high-weight IDOR (weight 2) but missed the endpoint (weight 1): 2/3.
    const result = EvalHarness.scoreCase(idorCase, [
      { type: "vulnerability", data: { note: "confirmed idor across tenants" } },
    ])
    expect(result.passed).toBe(false)
    expect(result.score).toBeCloseTo(2 / 3)
    expect(result.missing.map((m) => m.contains)).toEqual(["/api/orders"])
  })

  test("no match scores 0", () => {
    const result = EvalHarness.scoreCase(idorCase, [{ type: "subdomain", data: { host: "x.example.com" } }])
    expect(result.score).toBe(0)
    expect(result.passed).toBe(false)
  })

  test("matching is case-insensitive and requires the right type", () => {
    // Right substring but wrong type must not match.
    const wrongType = EvalHarness.scoreCase(idorCase, [{ type: "note", data: { text: "IDOR here" } }])
    expect(wrongType.matched).toHaveLength(0)
    const rightType = EvalHarness.scoreCase(idorCase, [{ type: "vulnerability", data: "IDOR" }])
    expect(rightType.matched).toHaveLength(1)
  })

  test("an empty expectation is trivially satisfied", () => {
    const result = EvalHarness.scoreCase({ id: "e", name: "e", category: "c", expected: [] }, [])
    expect(result.score).toBe(1)
    expect(result.passed).toBe(true)
  })
})

describe("EvalHarness.summarizeSuite", () => {
  test("aggregates overall and per-category accuracy", () => {
    const results = [
      { id: "1", name: "a", category: "web", score: 1, passed: true, matched: [], missing: [] },
      { id: "2", name: "b", category: "web", score: 0.5, passed: false, matched: [], missing: [] },
      { id: "3", name: "c", category: "ctf", score: 0, passed: false, matched: [], missing: [] },
    ]
    const summary = EvalHarness.summarizeSuite(results)
    expect(summary.cases).toBe(3)
    expect(summary.passed).toBe(1)
    expect(summary.passRate).toBeCloseTo(1 / 3)
    expect(summary.meanScore).toBeCloseTo((1 + 0.5 + 0) / 3)
    expect(summary.byCategory.web).toMatchObject({ cases: 2, passed: 1 })
    expect(summary.byCategory.web.meanScore).toBeCloseTo(0.75)
    expect(summary.byCategory.ctf).toMatchObject({ cases: 1, passed: 0, meanScore: 0 })
  })

  test("renders a compact report", () => {
    const summary = EvalHarness.summarizeSuite([
      { id: "1", name: "a", category: "web", score: 1, passed: true, matched: [], missing: [] },
    ])
    expect(EvalHarness.renderSummary(summary)).toContain("1/1 solved (100.0%)")
  })

  test("example suite is well-formed", () => {
    for (const c of examples) {
      expect(c.expected.length).toBeGreaterThan(0)
      for (const e of c.expected) expect(e.contains.length).toBeGreaterThan(0)
    }
  })
})

// End-to-end against real domain state: seed the Knowledge Graph the way record_discovery does,
// read findings back, and score — proving the harness measures a real engagement's output.
const sessionID = SessionV2.ID.make("ses_eval_test")
const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, KnowledgeGraphNode])))

describe("EvalHarness over a real Knowledge Graph", () => {
  it.effect("scores recorded findings against an eval case", () =>
    Effect.gen(function* () {
      const { db } = yield* Database.Service
      yield* db
        .insert(ProjectTable)
        .values({ id: Project.ID.global, worktree: AbsolutePath.make("/project"), sandboxes: [] })
        .run()
        .pipe(Effect.orDie)
      yield* db
        .insert(SessionTable)
        .values({ id: sessionID, project_id: Project.ID.global, slug: "eval", directory: "/project", title: "eval", version: "test" })
        .run()
        .pipe(Effect.orDie)
      const graph = yield* KnowledgeGraph

      // The agent discovered the endpoint and confirmed the IDOR.
      yield* graph.addFinding(sessionID, { type: "endpoint", data: { path: "/api/orders" }, noveltyScore: 0.5, confidenceScore: 0.6, impactScore: 0.3 })
      yield* graph.addFinding(sessionID, { type: "vulnerability", data: { class: "IDOR", proof: "read another tenant's order" }, noveltyScore: 0.7, confidenceScore: 0.9, impactScore: 0.9 })

      const findings = yield* graph.summarize(sessionID, 1000)
      const observed: EvalHarness.ObservedFinding[] = findings.map((f) => ({ type: f.type, data: f.data }))
      const result = EvalHarness.scoreCase(idorCase, observed)
      expect(result.passed).toBe(true)
      expect(result.score).toBe(1)
    }),
  )
})
