import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { Database } from "@impactr-ai/core/database/database"
import { LayerNode } from "@impactr-ai/core/effect/layer-node"
import { AppNodeBuilder } from "@impactr-ai/core/effect/app-node-builder"
import { KnowledgeGraph, node as KnowledgeGraphNode } from "@impactr-ai/core/knowledge/graph"
import { Project } from "@impactr-ai/core/project"
import { ProjectTable } from "@impactr-ai/core/project/sql"
import { AbsolutePath } from "@impactr-ai/core/schema"
import { SessionV2 } from "@impactr-ai/core/session"
import { SessionTable } from "@impactr-ai/core/session/sql"
import { testEffect } from "./lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, KnowledgeGraphNode])))
const sessionID = SessionV2.ID.make("ses_knowledge_test")

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
      slug: "knowledge",
      directory: "/project",
      title: "knowledge",
      version: "test",
    })
    .run()
    .pipe(Effect.orDie)
})

describe("KnowledgeGraph", () => {
  it.effect("records a new finding and reports its potential", () =>
    Effect.gen(function* () {
      yield* setup
      const graph = yield* KnowledgeGraph
      const record = yield* graph.addFinding(sessionID, {
        type: "endpoint",
        data: { path: "/admin" },
        noveltyScore: 0.5,
        confidenceScore: 0.4,
        impactScore: 0.3,
      })
      expect(record.status).toBe("created")
      expect(record.potential).toBeCloseTo(0.5 * 0.4 * 0.3)
    }),
  )

  it.effect("re-recording identical evidence is a duplicate, not a new finding", () =>
    Effect.gen(function* () {
      yield* setup
      const graph = yield* KnowledgeGraph
      const first = yield* graph.addFinding(sessionID, {
        type: "subdomain",
        data: { host: "api.example.com" },
        noveltyScore: 0.6,
        confidenceScore: 0.6,
        impactScore: 0.6,
      })
      const second = yield* graph.addFinding(sessionID, {
        type: "subdomain",
        data: { host: "api.example.com" },
        noveltyScore: 0.6,
        confidenceScore: 0.6,
        impactScore: 0.6,
      })
      expect(second.status).toBe("duplicate")
      // Same underlying finding — dedup must not create a second node.
      expect(second.id).toBe(first.id)
    }),
  )

  it.effect("accumulating evidence upgrades scores to the per-dimension max", () =>
    Effect.gen(function* () {
      yield* setup
      const graph = yield* KnowledgeGraph
      // Recon logs a weak first sighting.
      const first = yield* graph.addFinding(sessionID, {
        type: "endpoint",
        data: { path: "/admin" },
        noveltyScore: 0.5,
        confidenceScore: 0.4,
        impactScore: 0.3,
      })
      // The attack agent confirms it is an unauthenticated admin panel.
      const upgraded = yield* graph.addFinding(sessionID, {
        type: "endpoint",
        data: { path: "/admin" },
        noveltyScore: 0.2,
        confidenceScore: 0.95,
        impactScore: 0.9,
      })
      expect(upgraded.id).toBe(first.id)
      expect(upgraded.status).toBe("upgraded")
      // Each dimension rises to the better of the two (novelty stays at 0.5).
      expect(upgraded.potential).toBeCloseTo(0.5 * 0.9 * 0.95)

      // The upgrade is persisted: the finding now ranks by its stronger evidence.
      const [top] = yield* graph.summarize(sessionID, 1)
      expect(top.id).toBe(first.id)
      expect(top.confidenceScore).toBeCloseTo(0.95)
      expect(top.impactScore).toBeCloseTo(0.9)
      expect(top.noveltyScore).toBeCloseTo(0.5)
    }),
  )

  it.effect("weaker re-recording never downgrades a finding", () =>
    Effect.gen(function* () {
      yield* setup
      const graph = yield* KnowledgeGraph
      yield* graph.addFinding(sessionID, {
        type: "vulnerability",
        data: { id: "sqli-1" },
        noveltyScore: 0.9,
        confidenceScore: 0.9,
        impactScore: 0.9,
      })
      const weaker = yield* graph.addFinding(sessionID, {
        type: "vulnerability",
        data: { id: "sqli-1" },
        noveltyScore: 0.1,
        confidenceScore: 0.1,
        impactScore: 0.1,
      })
      expect(weaker.status).toBe("duplicate")
      expect(weaker.potential).toBeCloseTo(0.9 * 0.9 * 0.9)
    }),
  )
})
