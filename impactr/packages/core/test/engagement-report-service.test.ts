import fs from "fs/promises"
import path from "path"
import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { AppNodeBuilder } from "@impactr-ai/core/effect/app-node-builder"
import { LayerNode } from "@impactr-ai/core/effect/layer-node"
import { AttackGraph, node as AttackGraphNode } from "@impactr-ai/core/attack-graph/graph"
import { KnowledgeGraph, node as KnowledgeGraphNode } from "@impactr-ai/core/knowledge/graph"
import { Plan, node as PlanNode } from "@impactr-ai/core/session/plan"
import { EngagementReport, node as EngagementReportNode } from "@impactr-ai/core/session/engagement-report"
import { Database } from "@impactr-ai/core/database/database"
import { Location } from "@impactr-ai/core/location"
import { Project } from "@impactr-ai/core/project"
import { ProjectTable } from "@impactr-ai/core/project/sql"
import { AbsolutePath } from "@impactr-ai/core/schema"
import { SessionV2 } from "@impactr-ai/core/session"
import { SessionTable } from "@impactr-ai/core/session/sql"
import { location } from "./fixture/location"
import { tmpdir } from "./fixture/tmpdir"
import { it } from "./lib/effect"

const sessionID = SessionV2.ID.make("ses_report_service")

function provide(directory: string) {
  const activeLocation = Layer.succeed(
    Location.Service,
    Location.Service.of(location({ directory: AbsolutePath.make(directory) })),
  )
  return Effect.provide(
    AppNodeBuilder.build(
      LayerNode.group([Database.node, AttackGraphNode, KnowledgeGraphNode, PlanNode, EngagementReportNode]),
      [[Location.node, activeLocation]],
    ),
  )
}

function withTmp<A, E, R>(f: (directory: string) => Effect.Effect<A, E, R>) {
  return Effect.acquireRelease(
    Effect.promise(() => tmpdir()),
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
  ).pipe(Effect.flatMap((tmp) => f(tmp.path)))
}

const seedSession = Effect.gen(function* () {
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
      slug: "report",
      directory: "/project",
      title: "report",
      version: "test",
    })
    .run()
    .pipe(Effect.orDie)
})

describe("EngagementReport service", () => {
  it.live("gathers graph state and writes the consolidated report", () =>
    withTmp((directory) =>
      Effect.gen(function* () {
        yield* seedSession
        const knowledge = yield* KnowledgeGraph
        const graph = yield* AttackGraph
        const plan = yield* Plan
        const report = yield* EngagementReport.Service

        yield* knowledge.addFinding(sessionID, {
          type: "sqli",
          data: { path: "/login", param: "user" },
          noveltyScore: 0.9,
          confidenceScore: 0.9,
          impactScore: 0.95,
        })
        yield* graph.addNode(sessionID, {
          id: "n1",
          type: "endpoint",
          label: "/login",
          attributes: {},
          status: "compromised",
        })
        yield* graph.addNode(sessionID, {
          id: "v1",
          type: "vulnerability",
          label: "SQLi in /login",
          attributes: {},
          status: "compromised",
        })
        yield* graph.addEdge(sessionID, { source: "n1", target: "v1", relation: "vulnerable_to", attributes: {} })
        yield* plan.add(sessionID, { title: "Test authentication", priority: 0.9, status: "done" })

        const result = yield* report.generate(sessionID, "saturated")
        expect(result?.path).toBe("findings/ENGAGEMENT-REPORT.md")
        expect(result?.findingCount).toBe(1)

        const written = yield* Effect.promise(() =>
          fs.readFile(path.join(directory, "findings/ENGAGEMENT-REPORT.md"), "utf8"),
        )
        expect(written).toContain("# Impactr Engagement Report")
        expect(written).toContain("| Critical | sqli |")
        expect(written).toContain("`/login` **vulnerable_to** `SQLi in /login`")
        expect(written).toContain("✅ Test authentication")
      }).pipe(provide(directory)),
    ),
  )

  it.live("no-ops when the engagement has no findings and no assets", () =>
    withTmp((directory) =>
      Effect.gen(function* () {
        yield* seedSession
        const report = yield* EngagementReport.Service
        const result = yield* report.generate(sessionID, "budget-exhausted")
        expect(result).toBeUndefined()
        const exists = yield* Effect.promise(() =>
          fs
            .access(path.join(directory, "findings/ENGAGEMENT-REPORT.md"))
            .then(() => true)
            .catch(() => false),
        )
        expect(exists).toBe(false)
      }).pipe(provide(directory)),
    ),
  )
})
