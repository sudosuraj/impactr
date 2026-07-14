import { query } from "@solidjs/router"
import { and, desc, eq } from "drizzle-orm"
import { requireSession } from "./auth"
import {
  db,
  AsmAssetTable,
  EngagementTable,
  FindingTable,
  HostedAttackGraphEdgeTable,
  HostedAttackGraphNodeTable,
  HostedHypothesisQueueTable,
} from "./db"

/*
  One server round-trip that assembles the Command Center from the hosted, tenant-scoped
  tables. Everything joins through engagement.organization_id — the isolation boundary.
  Nothing here fabricates data: empty tables produce empty sections, and the UI shows
  honest empty states.
*/

const SEVERITY_PENALTY: Record<string, number> = { critical: 15, high: 8, medium: 4, low: 1, info: 0 }
const UNRESOLVED = ["open", "triaged"]

type Depth = "discovered" | "enumerated" | "vulnerable" | "exploited"

/** Attack-graph NodeStatus → how deep the agent has gone on that asset. */
function depthOf(status: string): Depth {
  if (status === "compromised") return "exploited"
  if (status === "exploiting") return "vulnerable"
  if (status === "enumerating") return "enumerated"
  return "discovered" // pending, dead_end
}

const CLASS_LABEL: Record<string, string> = {
  subdomain: "Subdomains",
  ip: "Hosts / IP",
  port: "Services",
  endpoint: "Endpoints",
}
const CLASS_ORDER = ["subdomain", "ip", "port", "endpoint"]

const PHASE_LABEL: Record<string, string> = {
  ip: "Host",
  port: "Service",
  subdomain: "Subdomain",
  endpoint: "Endpoint",
  credential: "Credential",
  vulnerability: "Vulnerability",
}

export interface ChainStep {
  readonly phase: string
  readonly detail: string
  readonly end: boolean
}
export interface Chain {
  readonly id: string
  readonly name: string
  readonly impact: string
  readonly steps: ChainStep[]
}

interface GraphNode {
  readonly id: string
  readonly type: string
  readonly label: string
  readonly status: string
}

/** Walk edges backward from each impactful terminal to assemble a foothold→…→impact narrative. */
function assembleChains(nodes: GraphNode[], edges: { source: string; target: string }[]): Chain[] {
  const byId = new Map<string, GraphNode>(nodes.map((n) => [n.id, n]))
  const incoming = new Map<string, string[]>()
  for (const edge of edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) continue
    const list = incoming.get(edge.target) ?? []
    list.push(edge.source)
    incoming.set(edge.target, list)
  }

  const terminals = nodes
    .filter((n) => n.status === "compromised" || n.status === "exploiting")
    .sort((a) => (a.status === "compromised" ? -1 : 1))
    .slice(0, 4)

  const chains: Chain[] = []
  for (const terminal of terminals) {
    const path: GraphNode[] = [terminal]
    const seen = new Set<string>([terminal.id])
    let cursor = terminal
    while (path.length < 5) {
      const preds = incoming.get(cursor.id) ?? []
      const next = preds.map((id) => byId.get(id)).find((n): n is GraphNode => !!n && !seen.has(n.id))
      if (!next) break
      seen.add(next.id)
      path.unshift(next)
      cursor = next
    }
    if (path.length < 2) continue
    const steps: ChainStep[] = path.map((node, i) => ({
      phase: PHASE_LABEL[node.type] ?? node.type,
      detail: node.label,
      end: i === path.length - 1,
    }))
    chains.push({
      id: terminal.id,
      name: `${path[0].label} → ${terminal.label}`,
      impact: terminal.status === "compromised" ? "Compromised" : "In progress",
      steps,
    })
  }
  return chains
}

function discoverySeries(timestamps: number[]) {
  if (timestamps.length === 0) return { series: [] as number[], peak: 0, current: 0, saturationPct: 0, spanHours: 0 }
  const hour = 3_600_000
  const min = Math.min(...timestamps)
  const max = Math.max(...timestamps)
  const buckets = Math.max(1, Math.min(24, Math.ceil((max - min) / hour) + 1))
  const size = Math.max(hour, Math.ceil((max - min) / buckets) || hour)
  const series = new Array(buckets).fill(0)
  for (const t of timestamps) {
    const idx = Math.min(buckets - 1, Math.floor((t - min) / size))
    series[idx]++
  }
  const peak = Math.max(...series)
  const current = series[series.length - 1]
  const saturationPct = peak > 0 ? Math.max(0, Math.min(100, Math.round((1 - current / peak) * 100))) : 0
  return { series, peak, current, saturationPct, spanHours: Math.round((max - min) / hour) }
}

async function assemble(organizationID: string) {
  const [findings, assets, nodes, edges, leads] = await Promise.all([
    db
      .select({
        id: FindingTable.id,
        severity: FindingTable.severity,
        status: FindingTable.status,
        time: FindingTable.time_created,
      })
      .from(FindingTable)
      .innerJoin(EngagementTable, eq(FindingTable.engagement_id, EngagementTable.id))
      .where(eq(EngagementTable.organization_id, organizationID as any)),
    db
      .select({ type: AsmAssetTable.type, discovered: AsmAssetTable.discovered_at })
      .from(AsmAssetTable)
      .innerJoin(EngagementTable, eq(AsmAssetTable.engagement_id, EngagementTable.id))
      .where(eq(EngagementTable.organization_id, organizationID as any)),
    db
      .select({
        id: HostedAttackGraphNodeTable.id,
        type: HostedAttackGraphNodeTable.type,
        label: HostedAttackGraphNodeTable.label,
        status: HostedAttackGraphNodeTable.status,
        discovered: HostedAttackGraphNodeTable.discovered_at,
      })
      .from(HostedAttackGraphNodeTable)
      .innerJoin(EngagementTable, eq(HostedAttackGraphNodeTable.engagement_id, EngagementTable.id))
      .where(eq(EngagementTable.organization_id, organizationID as any)),
    db
      .select({ source: HostedAttackGraphEdgeTable.source, target: HostedAttackGraphEdgeTable.target })
      .from(HostedAttackGraphEdgeTable)
      .innerJoin(EngagementTable, eq(HostedAttackGraphEdgeTable.engagement_id, EngagementTable.id))
      .where(eq(EngagementTable.organization_id, organizationID as any)),
    db
      .select({
        id: HostedHypothesisQueueTable.id,
        description: HostedHypothesisQueueTable.description,
        priority: HostedHypothesisQueueTable.priority,
        status: HostedHypothesisQueueTable.status,
      })
      .from(HostedHypothesisQueueTable)
      .innerJoin(EngagementTable, eq(HostedHypothesisQueueTable.engagement_id, EngagementTable.id))
      .where(
        and(
          eq(EngagementTable.organization_id, organizationID as any),
          eq(HostedHypothesisQueueTable.status, "pending"),
        ),
      )
      .orderBy(desc(HostedHypothesisQueueTable.priority))
      .limit(6),
  ])

  const openFindings = findings.filter((f) => UNRESOLVED.includes(f.status))
  const penalty = openFindings.reduce((sum, f) => sum + (SEVERITY_PENALTY[f.severity] ?? 0), 0)
  const exposureIndex = Math.min(100, penalty)
  const bySeverity = (s: string) => openFindings.filter((f) => f.severity === s).length

  const footholds = nodes.filter((n) => n.status === "compromised").length
  const hourAgo = Date.now() - 3_600_000
  const surfaceNew = assets.filter((a) => a.discovered >= hourAgo).length

  const terrain = CLASS_ORDER.map((type) => {
    const of = nodes.filter((n) => n.type === type)
    return {
      type,
      label: CLASS_LABEL[type],
      total: of.length,
      cells: of.slice(0, 160).map((n) => depthOf(n.status)) as Depth[],
    }
  }).filter((row) => row.total > 0)

  const discovery = discoverySeries([
    ...assets.map((a) => a.discovered),
    ...findings.map((f) => f.time),
    ...nodes.map((n) => n.discovered),
  ])

  return {
    kpis: {
      surface: assets.length,
      surfaceNew,
      footholds,
      exposure: exposureIndex,
      leads: leads.length,
    },
    exposure: { index: exposureIndex, critical: bySeverity("critical"), high: bySeverity("high"), medium: bySeverity("medium") },
    discovery,
    chains: assembleChains(nodes, edges),
    leads: leads.map((l) => ({ id: l.id, description: l.description, priority: l.priority, status: l.status })),
    terrain,
  }
}

export type CommandCenter = Awaited<ReturnType<typeof assemble>>

export const getCommandCenter = query(async () => {
  "use server"
  const session = await requireSession()
  return assemble(session.organizationID)
}, "command-center")
