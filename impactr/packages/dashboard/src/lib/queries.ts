import { and, desc, eq, like, or } from "drizzle-orm"
import {
  db,
  AsmAssetTable,
  EngagementAuditLogTable,
  EngagementTable,
  FindingTable,
  HostedAttackGraphEdgeTable,
  HostedAttackGraphNodeTable,
  MembershipTable,
  OrganizationTable,
  UserTable,
} from "./db"

/**
 * Every query here joins through `engagement.organization_id` — the tenant-isolation
 * boundary from specs/tenant-model.md. Never trust a bare finding/asset/engagement id
 * without it.
 */

export function getOrganization(organizationID: string) {
  return db.select().from(OrganizationTable).where(eq(OrganizationTable.id, organizationID as any)).get()
}

export interface FindingFilter {
  readonly search?: string
  readonly severity?: string
  readonly status?: string
}

function findingFilterClauses(organizationID: string, filter?: FindingFilter) {
  const clauses = [eq(EngagementTable.organization_id, organizationID as any)]
  if (filter?.severity) clauses.push(eq(FindingTable.severity, filter.severity as any))
  if (filter?.status) clauses.push(eq(FindingTable.status, filter.status as any))
  if (filter?.search) {
    const term = `%${filter.search}%`
    clauses.push(or(like(FindingTable.title, term), like(FindingTable.description, term))!)
  }
  return and(...clauses)
}

export function listFindings(organizationID: string, filter?: FindingFilter) {
  return db
    .select({ finding: FindingTable })
    .from(FindingTable)
    .innerJoin(EngagementTable, eq(FindingTable.engagement_id, EngagementTable.id))
    .where(findingFilterClauses(organizationID, filter))
    .orderBy(desc(FindingTable.time_created))
    .then((rows) => rows.map((row) => row.finding))
}

export function getFinding(id: string, organizationID: string) {
  return db
    .select({ finding: FindingTable })
    .from(FindingTable)
    .innerJoin(EngagementTable, eq(FindingTable.engagement_id, EngagementTable.id))
    .where(and(eq(FindingTable.id, id as any), eq(EngagementTable.organization_id, organizationID as any)))
    .get()
    .then((row) => row?.finding)
}

export interface AssetFilter {
  readonly search?: string
  readonly type?: string
}

function assetFilterClauses(organizationID: string, filter?: AssetFilter) {
  const clauses = [eq(EngagementTable.organization_id, organizationID as any)]
  if (filter?.type) clauses.push(eq(AsmAssetTable.type, filter.type as any))
  if (filter?.search) clauses.push(like(AsmAssetTable.value, `%${filter.search}%`))
  return and(...clauses)
}

export function listAssets(organizationID: string, filter?: AssetFilter) {
  return db
    .select({ asset: AsmAssetTable })
    .from(AsmAssetTable)
    .innerJoin(EngagementTable, eq(AsmAssetTable.engagement_id, EngagementTable.id))
    .where(assetFilterClauses(organizationID, filter))
    .orderBy(desc(AsmAssetTable.discovered_at))
    .then((rows) => rows.map((row) => row.asset))
}

export function getAsset(id: string, organizationID: string) {
  return db
    .select({ asset: AsmAssetTable })
    .from(AsmAssetTable)
    .innerJoin(EngagementTable, eq(AsmAssetTable.engagement_id, EngagementTable.id))
    .where(and(eq(AsmAssetTable.id, id as any), eq(EngagementTable.organization_id, organizationID as any)))
    .get()
    .then((row) => row?.asset)
}

export async function getAttackGraphSummary(organizationID: string) {
  const nodes = await db
    .select({ status: HostedAttackGraphNodeTable.status })
    .from(HostedAttackGraphNodeTable)
    .innerJoin(EngagementTable, eq(HostedAttackGraphNodeTable.engagement_id, EngagementTable.id))
    .where(eq(EngagementTable.organization_id, organizationID as any))

  const edges = await db
    .select({ id: HostedAttackGraphEdgeTable.source })
    .from(HostedAttackGraphEdgeTable)
    .innerJoin(EngagementTable, eq(HostedAttackGraphEdgeTable.engagement_id, EngagementTable.id))
    .where(eq(EngagementTable.organization_id, organizationID as any))

  const byStatus: Record<string, number> = {}
  for (const node of nodes) byStatus[node.status] = (byStatus[node.status] ?? 0) + 1

  return { totalNodes: nodes.length, totalEdges: edges.length, byStatus }
}

export async function getEngagementAttackGraphSummary(engagementId: string) {
  const nodes = await db
    .select({ status: HostedAttackGraphNodeTable.status })
    .from(HostedAttackGraphNodeTable)
    .where(eq(HostedAttackGraphNodeTable.engagement_id, engagementId as any))

  const edges = await db
    .select({ id: HostedAttackGraphEdgeTable.source })
    .from(HostedAttackGraphEdgeTable)
    .where(eq(HostedAttackGraphEdgeTable.engagement_id, engagementId as any))

  const byStatus: Record<string, number> = {}
  for (const node of nodes) byStatus[node.status] = (byStatus[node.status] ?? 0) + 1

  return { totalNodes: nodes.length, totalEdges: edges.length, byStatus }
}

const SEVERITY_PENALTY: Record<string, number> = { critical: 15, high: 8, medium: 4, low: 1, info: 0 }
const UNRESOLVED_STATUSES = ["open", "triaged"]

/** 100 minus weighted penalties for unresolved findings, floored at 0 — deterministic, not a guess. */
function computeSecurityScore(openFindings: ReadonlyArray<{ severity: string }>): number {
  const penalty = openFindings.reduce((sum, finding) => sum + (SEVERITY_PENALTY[finding.severity] ?? 0), 0)
  return Math.max(0, 100 - penalty)
}

export async function getDashboardStats(organizationID: string) {
  const [findings, assets, activeEngagements, recentAuditLog] = await Promise.all([
    db
      .select({ id: FindingTable.id, severity: FindingTable.severity, status: FindingTable.status })
      .from(FindingTable)
      .innerJoin(EngagementTable, eq(FindingTable.engagement_id, EngagementTable.id))
      .where(eq(EngagementTable.organization_id, organizationID as any)),
    db
      .select({ id: AsmAssetTable.id })
      .from(AsmAssetTable)
      .innerJoin(EngagementTable, eq(AsmAssetTable.engagement_id, EngagementTable.id))
      .where(eq(EngagementTable.organization_id, organizationID as any)),
    db
      .select({ id: EngagementTable.id })
      .from(EngagementTable)
      .where(and(eq(EngagementTable.organization_id, organizationID as any), eq(EngagementTable.status, "active"))),
    db
      .select({ log: EngagementAuditLogTable })
      .from(EngagementAuditLogTable)
      .innerJoin(EngagementTable, eq(EngagementAuditLogTable.engagement_id, EngagementTable.id))
      .where(eq(EngagementTable.organization_id, organizationID as any))
      .orderBy(desc(EngagementAuditLogTable.time_created))
      .limit(10),
  ])

  const openFindings = findings.filter((finding) => UNRESOLVED_STATUSES.includes(finding.status))
  const recentFindings = await listFindings(organizationID)

  return {
    securityScore: computeSecurityScore(openFindings),
    activeAssetsCount: assets.length,
    runningScansCount: activeEngagements.length,
    criticalFindingsCount: openFindings.filter((finding) => finding.severity === "critical").length,
    recentFindings: recentFindings.slice(0, 5),
    recentActivity: recentAuditLog.map((row) => row.log),
  }
}

export type EngagementSummary = Awaited<ReturnType<typeof listEngagements>>[number]

export async function listEngagements(organizationID: string) {
  const engagements = await db.select().from(EngagementTable).where(eq(EngagementTable.organization_id, organizationID as any)).orderBy(desc(EngagementTable.time_created))

  return Promise.all(
    engagements.map(async (engagement) => {
      const nodes = await db
        .select({ status: HostedAttackGraphNodeTable.status })
        .from(HostedAttackGraphNodeTable)
        .where(eq(HostedAttackGraphNodeTable.engagement_id, engagement.id))
      const compromised = nodes.filter((node) => node.status === "compromised").length
      return { engagement, nodeCount: nodes.length, compromisedCount: compromised }
    }),
  )
}

export function getEngagement(id: string, organizationID: string) {
  return db
    .select()
    .from(EngagementTable)
    .where(and(eq(EngagementTable.id, id as any), eq(EngagementTable.organization_id, organizationID as any)))
    .get()
}

/** Chronological, real events for an engagement: assets discovered, findings recorded, audit log entries. */
export async function getEngagementTimeline(engagementId: string) {
  const [assets, findings, auditLog] = await Promise.all([
    db.select().from(AsmAssetTable).where(eq(AsmAssetTable.engagement_id, engagementId as any)),
    db.select().from(FindingTable).where(eq(FindingTable.engagement_id, engagementId as any)),
    db.select().from(EngagementAuditLogTable).where(eq(EngagementAuditLogTable.engagement_id, engagementId as any)),
  ])

  type Event = { id: string; time: number; kind: "asset" | "finding" | "audit"; data: unknown }
  const events: Event[] = [
    ...assets.map((asset) => ({ id: `asset-${asset.id}`, time: asset.discovered_at, kind: "asset" as const, data: asset })),
    ...findings.map((finding) => ({ id: `finding-${finding.id}`, time: finding.time_created, kind: "finding" as const, data: finding })),
    ...auditLog.map((log) => ({ id: `audit-${log.id}`, time: log.time_created, kind: "audit" as const, data: log })),
  ]

  return events.sort((a, b) => b.time - a.time)
}

export function getMembership(userID: string, organizationID: string) {
  return db
    .select({ user: UserTable, role: MembershipTable.role })
    .from(MembershipTable)
    .innerJoin(UserTable, eq(MembershipTable.user_id, UserTable.id))
    .where(and(eq(MembershipTable.user_id, userID as any), eq(MembershipTable.organization_id, organizationID as any)))
    .get()
}

export function listMemberships(organizationID: string) {
  return db
    .select({ user: UserTable, role: MembershipTable.role, joined: MembershipTable.time_created })
    .from(MembershipTable)
    .innerJoin(UserTable, eq(MembershipTable.user_id, UserTable.id))
    .where(eq(MembershipTable.organization_id, organizationID as any))
    .orderBy(desc(MembershipTable.time_created))
}
