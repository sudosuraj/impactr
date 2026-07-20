import { describe, expect, test } from "bun:test"
import { EngagementReport } from "@impactr-ai/core/session/engagement-report"
import type { GraphState, Node } from "@impactr-ai/core/attack-graph/schema"
import type { Finding } from "@impactr-ai/core/knowledge/graph"
import type { Objective } from "@impactr-ai/core/session/plan"

const node = (over: Partial<Node> & Pick<Node, "id" | "type" | "label" | "status">): Node => ({
  attributes: {},
  discoveredAt: 0,
  loopCount: 0,
  ...over,
})

const finding = (over: Partial<Finding> & Pick<Finding, "type" | "data" | "impactScore">): Finding => ({
  id: over.id ?? crypto.randomUUID(),
  noveltyScore: over.noveltyScore ?? 0.5,
  confidenceScore: over.confidenceScore ?? 0.8,
  potential: over.potential ?? 0.5,
  ...over,
})

const objective = (over: Partial<Objective> & Pick<Objective, "id" | "title" | "status">): Objective => ({
  parentId: undefined,
  rationale: undefined,
  priority: 0.5,
  ...over,
})

const baseInput = (over: Partial<Parameters<typeof EngagementReport.render>[0]> = {}) =>
  EngagementReport.render({
    sessionId: "ses_report_test",
    generatedAt: new Date("2026-07-19T12:00:00.000Z"),
    conclusion: "saturated",
    findings: [],
    graph: { nodes: {}, edges: [] } satisfies GraphState,
    plan: [],
    ...over,
  })

describe("EngagementReport.render", () => {
  test("headers the report with the session and conclusion reason", () => {
    const md = baseInput({ conclusion: "budget-exhausted" })
    expect(md).toContain("# Impactr Engagement Report")
    expect(md).toContain("ses_report_test")
    expect(md).toContain("2026-07-19T12:00:00.000Z")
    expect(md).toContain("Session budget exhausted.")
  })

  test("labels a drained hypothesis backlog distinctly from budget exhaustion", () => {
    const md = baseInput({ conclusion: "backlog-drained" })
    expect(md).toContain("Hypothesis backlog empty")
    expect(md).not.toContain("Session budget exhausted.")
  })

  test("summarizes asset, compromise, and finding counts", () => {
    const graph: GraphState = {
      nodes: {
        h1: node({ id: "h1", type: "ip", label: "10.0.0.1", status: "compromised" }),
        e1: node({ id: "e1", type: "endpoint", label: "/admin", status: "enumerating" }),
        v1: node({ id: "v1", type: "vulnerability", label: "SQLi in /login", status: "compromised" }),
      },
      edges: [],
    }
    const md = baseInput({ graph, findings: [finding({ type: "sqli", data: { path: "/login" }, impactScore: 0.9 })] })
    expect(md).toContain("**Assets discovered:** 3")
    expect(md).toContain("**Assets compromised:** 2")
    expect(md).toContain("**Vulnerabilities mapped:** 1")
    expect(md).toContain("**Findings recorded:** 1")
  })

  test("ranks findings by potential and bands severity by impact", () => {
    const md = baseInput({
      findings: [
        finding({ type: "info-leak", data: "banner", impactScore: 0.2, potential: 0.1 }),
        finding({ type: "rce", data: { cmd: "id" }, impactScore: 0.95, potential: 0.9 }),
      ],
    })
    const rceIndex = md.indexOf("| Critical | rce |")
    const leakIndex = md.indexOf("| Low | info-leak |")
    expect(rceIndex).toBeGreaterThan(-1)
    expect(leakIndex).toBeGreaterThan(-1)
    // Higher potential (rce) must appear before the low-potential leak.
    expect(rceIndex).toBeLessThan(leakIndex)
  })

  test("renders exploit paths from vulnerable_to and exposes edges", () => {
    const graph: GraphState = {
      nodes: {
        app: node({ id: "app", type: "endpoint", label: "/upload", status: "compromised" }),
        rce: node({ id: "rce", type: "vulnerability", label: "unrestricted upload", status: "compromised" }),
      },
      edges: [{ source: "app", target: "rce", relation: "vulnerable_to", attributes: {} }],
    }
    const md = baseInput({ graph })
    expect(md).toContain("## Exploit paths")
    expect(md).toContain("`/upload` **vulnerable_to** `unrestricted upload`")
  })

  test("reports plan coverage with completed and abandoned objectives", () => {
    const md = baseInput({
      plan: [
        objective({ id: "o1", title: "Test auth", status: "done" }),
        objective({ id: "o2", title: "Probe upload", status: "abandoned", rationale: "not present" }),
        objective({ id: "o3", title: "Map API", status: "pending" }),
      ],
    })
    expect(md).toContain("1 completed · 1 abandoned · 1 still open of 3 objectives.")
    expect(md).toContain("✅ Test auth")
    expect(md).toContain("🚫 Probe upload — not present")
  })

  test("escapes pipes in finding detail so the table stays well-formed", () => {
    const md = baseInput({ findings: [finding({ type: "xss", data: "a|b|c", impactScore: 0.5 })] })
    expect(md).toContain("a\\|b\\|c")
  })

  test("degrades to explicit empty-state notes when nothing was found", () => {
    const md = baseInput()
    expect(md).toContain("_No findings were recorded during this engagement._")
    expect(md).toContain("_No assets were mapped into the attack graph._")
    expect(md).toContain("_No plan objectives were recorded._")
  })
})
