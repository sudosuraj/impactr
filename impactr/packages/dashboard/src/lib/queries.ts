import { and, desc, eq } from "drizzle-orm"
import { db, AsmAssetTable, EngagementTable, FindingTable } from "./db"

/**
 * Every query here joins through `engagement.organization_id` — the tenant-isolation
 * boundary from specs/tenant-model.md. Never trust a bare finding/asset id without it.
 */

export function listFindings(organizationID: string) {
  return db
    .select({ finding: FindingTable })
    .from(FindingTable)
    .innerJoin(EngagementTable, eq(FindingTable.engagement_id, EngagementTable.id))
    .where(eq(EngagementTable.organization_id, organizationID as any))
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

export function listAssets(organizationID: string) {
  return db
    .select({ asset: AsmAssetTable })
    .from(AsmAssetTable)
    .innerJoin(EngagementTable, eq(AsmAssetTable.engagement_id, EngagementTable.id))
    .where(eq(EngagementTable.organization_id, organizationID as any))
    .orderBy(desc(AsmAssetTable.discovered_at))
    .then((rows) => rows.map((row) => row.asset))
}
