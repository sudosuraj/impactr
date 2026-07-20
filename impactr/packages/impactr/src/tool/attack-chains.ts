import type { GraphState, Node } from "@impactr-ai/core/attack-graph/schema"

/**
 * Pure exploit-chain surfacing over the Attack Graph. A chain is a composed path — small gaps that
 * link into real impact: `subdomain --exposes--> endpoint --vulnerable_to--> RCE`, or a `credential`
 * that reaches an admin `endpoint`. Chain-hunting is "where the real impact is" per the orchestrator
 * prompt, so this makes it a tool instead of a manual graph walk. Kept IO-free and bounded so it is
 * unit-testable and can't blow up on a large graph.
 */

export interface ChainStep {
  readonly id: string
  readonly label: string
  readonly type: string
  /** The relation edge taken to reach this step from the previous one (undefined for the first). */
  readonly relation?: string
}

export interface Chain {
  readonly steps: ReadonlyArray<ChainStep>
  readonly severity: string
  readonly score: number
}

const SEVERITY_RANK: Record<string, number> = { critical: 5, high: 4, medium: 3, low: 2, info: 1, unknown: 1 }
const SEVERITY_LABEL = ["unknown", "info", "low", "medium", "high", "critical"]

/** A node worth ending a chain on: a proven/exploited foothold, a vulnerability, or a credential. */
const isImpact = (node: Node): boolean =>
  node.type === "vulnerability" || node.type === "credential" || node.status === "compromised"

const severityOf = (node: Node, edgeSeverity: string | undefined): number => {
  const nodeSev = typeof node.attributes?.severity === "string" ? SEVERITY_RANK[node.attributes.severity] ?? 0 : 0
  const edgeSev = edgeSeverity ? SEVERITY_RANK[edgeSeverity] ?? 0 : 0
  const compromised = node.status === "compromised" ? 4 : 0
  return Math.max(nodeSev, edgeSev, compromised)
}

const MAX_DEPTH = 4
/** Global visit budget so a dense graph can't make this quadratic — chains beyond it are still ranked. */
const VISIT_BUDGET = 20000

/**
 * Surface the highest-impact composed paths. Enumerates simple paths (no repeated node) up to
 * MAX_DEPTH edges and keeps those of length ≥2 that terminate on an impact node, ranked by the
 * maximum severity encountered then by length (longer composition = more interesting).
 */
export const findChains = (graph: GraphState, limit = 15): ReadonlyArray<Chain> => {
  const adjacency = new Map<string, Array<{ target: string; relation: string; severity?: string }>>()
  for (const edge of graph.edges) {
    const list = adjacency.get(edge.source) ?? []
    const severity = typeof edge.attributes?.severity === "string" ? edge.attributes.severity : undefined
    list.push({ target: edge.target, relation: edge.relation, severity })
    adjacency.set(edge.source, list)
  }

  const chains: Chain[] = []
  const seen = new Set<string>()
  let budget = VISIT_BUDGET

  const record = (steps: ChainStep[], sev: number) => {
    const key = steps.map((s) => s.id).join(">")
    if (seen.has(key)) return
    seen.add(key)
    chains.push({ steps: [...steps], severity: SEVERITY_LABEL[sev] ?? "unknown", score: sev * 100 + steps.length })
  }

  const walk = (nodeId: string, steps: ChainStep[], visited: Set<string>, sev: number) => {
    if (budget <= 0) return
    const node = graph.nodes[nodeId]
    if (!node) return
    if (steps.length >= 2 && isImpact(node)) record(steps, sev)
    if (steps.length >= MAX_DEPTH + 1) return
    for (const edge of adjacency.get(nodeId) ?? []) {
      if (visited.has(edge.target)) continue
      const next = graph.nodes[edge.target]
      if (!next) continue
      budget -= 1
      if (budget <= 0) return
      visited.add(edge.target)
      walk(
        edge.target,
        [...steps, { id: next.id, label: next.label, type: next.type, relation: edge.relation }],
        visited,
        Math.max(sev, severityOf(next, edge.severity)),
      )
      visited.delete(edge.target)
    }
  }

  for (const start of Object.values(graph.nodes)) {
    if (!adjacency.has(start.id)) continue
    walk(start.id, [{ id: start.id, label: start.label, type: start.type }], new Set([start.id]), severityOf(start, undefined))
    if (budget <= 0) break
  }

  return chains.sort((a, b) => b.score - a.score).slice(0, limit)
}

/** Render chains as one line each: `label --relation--> label --relation--> label`, prefixed by severity. */
export const renderChains = (chains: ReadonlyArray<Chain>): string => {
  if (chains.length === 0)
    return "No exploit chains found yet. Chains form as you link findings — add `vulnerable_to`/`exposes`/`uses` edges between assets (nuclei and the technique tools do this automatically)."
  return chains
    .map((chain) => {
      const path = chain.steps
        .map((step, i) => (i === 0 ? step.label : `--${step.relation}--> ${step.label}`))
        .join(" ")
      return `[${chain.severity}] ${path}`
    })
    .join("\n")
}
