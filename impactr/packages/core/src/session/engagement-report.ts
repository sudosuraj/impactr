export * as EngagementReport from "./engagement-report"

import { Context, Effect, Layer } from "effect"
import * as AttackGraph from "../attack-graph/graph"
import type { GraphState, Node } from "../attack-graph/schema"
import * as KnowledgeGraph from "../knowledge/graph"
import type { Finding } from "../knowledge/graph"
import { Location } from "../location"
import { FSUtil } from "../fs-util"
import * as Plan from "./plan"
import type { Objective } from "./plan"
import { makeLocationNode } from "../effect/app-node"
import path from "path"

/** Why the autonomous engine wound the engagement down — surfaced in the report header. */
export type Conclusion = "saturated" | "budget-exhausted" | "backlog-drained"

/** Everything the renderer needs, gathered once so the render stays a pure function. */
export interface ReportInput {
  readonly sessionId: string
  readonly generatedAt: Date
  readonly conclusion: Conclusion
  readonly findings: ReadonlyArray<Finding>
  readonly graph: GraphState
  readonly plan: ReadonlyArray<Objective>
}

/** The synthesized report and where it landed, so the caller can log or surface the path. */
export interface Report {
  readonly path: string
  readonly findingCount: number
}

const CONCLUSION_LABEL: Record<Conclusion, string> = {
  saturated: "Knowledge saturated — discovery rate fell below the continue threshold.",
  "budget-exhausted": "Session budget exhausted.",
  "backlog-drained": "Hypothesis backlog empty — no further leads queued.",
}

/** Coarse severity band from a finding's assessed impact, used only for grouping the report. */
const severityOf = (impactScore: number): "Critical" | "High" | "Medium" | "Low" =>
  impactScore >= 0.85 ? "Critical" : impactScore >= 0.6 ? "High" : impactScore >= 0.35 ? "Medium" : "Low"

/** Compact one-line rendering of a finding's opaque `data` payload. */
const describeData = (data: unknown): string => {
  if (data === null || data === undefined) return ""
  if (typeof data === "string") return data
  const json = JSON.stringify(data)
  return json.length > 240 ? `${json.slice(0, 240)}…` : json
}

const NODE_TYPE_HEADING: Record<Node["type"], string> = {
  ip: "Hosts",
  port: "Ports / Services",
  subdomain: "Subdomains",
  endpoint: "Endpoints",
  credential: "Credentials",
  vulnerability: "Vulnerabilities",
}

/** Stable presentation order for the attack-surface section; also the key set to iterate without a cast. */
const NODE_TYPE_ORDER: ReadonlyArray<Node["type"]> = [
  "ip",
  "port",
  "subdomain",
  "endpoint",
  "credential",
  "vulnerability",
]

/**
 * Render the consolidated engagement report as Markdown from already-gathered graph state.
 *
 * Pure by construction — no IO, no clock, no service access — so it is unit-testable against
 * fixed inputs and the service layer stays a thin data-gathering shell around it. This is the
 * artifact a human operator reads to understand what the autonomous run found and proved:
 * the engine writes it exactly once, when it concludes, rather than leaving a silent SQLite graph.
 */
export const render = (input: ReportInput): string => {
  const nodes = Object.values(input.graph.nodes)
  const compromised = nodes.filter((n) => n.status === "compromised")
  const vulnerabilities = nodes.filter((n) => n.type === "vulnerability")
  const rankedFindings = [...input.findings].sort((a, b) => b.potential - a.potential)

  const lines: string[] = []
  lines.push("# Impactr Engagement Report")
  lines.push("")
  lines.push(`_Generated ${input.generatedAt.toISOString()} · session \`${input.sessionId}\`_`)
  lines.push("")

  lines.push("## Executive summary")
  lines.push("")
  lines.push(`- **Assets discovered:** ${nodes.length}`)
  lines.push(`- **Assets compromised:** ${compromised.length}`)
  lines.push(`- **Vulnerabilities mapped:** ${vulnerabilities.length}`)
  lines.push(`- **Findings recorded:** ${input.findings.length}`)
  lines.push(`- **Engagement concluded:** ${CONCLUSION_LABEL[input.conclusion]}`)
  lines.push("")

  lines.push("## Key findings")
  lines.push("")
  if (rankedFindings.length === 0) lines.push("_No findings were recorded during this engagement._")
  else {
    lines.push("| Severity | Type | Detail | Potential |")
    lines.push("| --- | --- | --- | --- |")
    for (const f of rankedFindings) {
      const detail = describeData(f.data).replace(/\|/g, "\\|") || "—"
      lines.push(`| ${severityOf(f.impactScore)} | ${f.type} | ${detail} | ${f.potential.toFixed(2)} |`)
    }
  }
  lines.push("")

  lines.push("## Attack surface")
  lines.push("")
  if (nodes.length === 0) lines.push("_No assets were mapped into the attack graph._")
  else {
    const byType = new Map<Node["type"], Node[]>()
    for (const n of nodes) {
      const list = byType.get(n.type) ?? []
      list.push(n)
      byType.set(n.type, list)
    }
    for (const type of NODE_TYPE_ORDER) {
      const group = byType.get(type)
      if (!group || group.length === 0) continue
      lines.push(`### ${NODE_TYPE_HEADING[type]} (${group.length})`)
      lines.push("")
      for (const n of group) lines.push(`- \`${n.label}\` — ${n.status}`)
      lines.push("")
    }
  }

  const relations = input.graph.edges.filter((e) => e.relation === "vulnerable_to" || e.relation === "exposes")
  if (relations.length > 0) {
    lines.push("## Exploit paths")
    lines.push("")
    lines.push(
      "Composed relationships across the graph — small gaps often chain into real impact when linked.",
    )
    lines.push("")
    for (const e of relations) {
      const source = input.graph.nodes[e.source]?.label ?? e.source
      const target = input.graph.nodes[e.target]?.label ?? e.target
      lines.push(`- \`${source}\` **${e.relation}** \`${target}\``)
    }
    lines.push("")
  }

  const planActivity = input.plan.filter((o) => o.status === "done" || o.status === "abandoned")
  lines.push("## Plan coverage")
  lines.push("")
  if (input.plan.length === 0) lines.push("_No plan objectives were recorded._")
  else {
    const done = input.plan.filter((o) => o.status === "done").length
    const abandoned = input.plan.filter((o) => o.status === "abandoned").length
    const open = input.plan.length - done - abandoned
    lines.push(`${done} completed · ${abandoned} abandoned · ${open} still open of ${input.plan.length} objectives.`)
    lines.push("")
    if (planActivity.length > 0) {
      for (const o of planActivity)
        lines.push(`- ${o.status === "done" ? "✅" : "🚫"} ${o.title}${o.rationale ? ` — ${o.rationale}` : ""}`)
      lines.push("")
    }
  }

  return `${lines.join("\n")}\n`
}

/** Path, relative to the engagement working directory, where the report is written. */
export const REPORT_PATH = "findings/ENGAGEMENT-REPORT.md"

export interface Interface {
  /**
   * Synthesize and persist the consolidated engagement report. Returns `undefined` when there is
   * nothing worth reporting (no findings and no mapped assets), so a trivial drain writes no file.
   */
  readonly generate: (
    sessionId: string,
    conclusion: Conclusion,
  ) => Effect.Effect<Report | undefined, Error>
}

export class Service extends Context.Service<Service, Interface>()("@impactr-ai/core/session/engagement-report") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const knowledge = yield* KnowledgeGraph.KnowledgeGraph
    const attackGraph = yield* AttackGraph.AttackGraph
    const plan = yield* Plan.Plan
    const location = yield* Location.Service
    const fs = yield* FSUtil.Service

    const generate = Effect.fn("EngagementReport.generate")(function* (
      sessionId: string,
      conclusion: Conclusion,
    ) {
      const findings = yield* knowledge.summarize(sessionId, 200)
      const graph = yield* attackGraph.getGraph(sessionId)
      if (findings.length === 0 && Object.keys(graph.nodes).length === 0) return undefined
      const objectives = yield* plan.get(sessionId)
      const content = render({
        sessionId,
        generatedAt: new Date(),
        conclusion,
        findings,
        graph,
        plan: objectives,
      })
      const target = path.join(location.directory, REPORT_PATH)
      yield* fs.writeWithDirs(target, content)
      return { path: REPORT_PATH, findingCount: findings.length }
    })

    return Service.of({ generate })
  }),
)

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [KnowledgeGraph.node, AttackGraph.node, Plan.node, Location.node, FSUtil.node],
})
