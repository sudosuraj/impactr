import { query } from "@solidjs/router"
import { requireSession } from "./auth"
import {
  getAsset,
  getAttackGraphSummary,
  getDashboardStats,
  getEngagement,
  getEngagementAttackGraphSummary,
  getEngagementTimeline,
  getFinding,
  getMembership,
  getOrganization,
  listAssets,
  listEngagements,
  listFindings,
  listMemberships,
  type AssetFilter,
  type FindingFilter,
} from "./queries"

export const getViewer = query(async () => {
  "use server"
  const session = await requireSession()
  const organization = await getOrganization(session.organizationID)
  return { email: session.email, organizationName: organization?.name ?? "Organization", organizationID: session.organizationID }
}, "viewer")

export const getDashboard = query(async () => {
  "use server"
  const session = await requireSession()
  return getDashboardStats(session.organizationID)
}, "dashboard")

export const getFindings = query(async (filter?: FindingFilter) => {
  "use server"
  const session = await requireSession()
  return listFindings(session.organizationID, filter)
}, "findings")

export const getFindingDetail = query(async (id: string) => {
  "use server"
  const session = await requireSession()
  return getFinding(id, session.organizationID)
}, "finding-detail")

export const getAssets = query(async (filter?: AssetFilter) => {
  "use server"
  const session = await requireSession()
  return listAssets(session.organizationID, filter)
}, "assets")

export const getAssetDetail = query(async (id: string) => {
  "use server"
  const session = await requireSession()
  return getAsset(id, session.organizationID)
}, "asset-detail")

export const getEngagements = query(async () => {
  "use server"
  const session = await requireSession()
  return listEngagements(session.organizationID)
}, "engagements")

export const getEngagementDetail = query(async (id: string) => {
  "use server"
  const session = await requireSession()
  const engagement = await getEngagement(id, session.organizationID)
  if (!engagement) return undefined
  const [timeline, graph] = await Promise.all([getEngagementTimeline(id), getEngagementAttackGraphSummary(id)])
  return { engagement, timeline, graph }
}, "engagement-detail")

export const getDashboardAttackGraph = query(async () => {
  "use server"
  const session = await requireSession()
  return getAttackGraphSummary(session.organizationID)
}, "attack-graph-summary")

export const getTeamMembers = query(async () => {
  "use server"
  const session = await requireSession()
  return listMemberships(session.organizationID)
}, "team-members")

export const getProfile = query(async () => {
  "use server"
  const session = await requireSession()
  const [membership, organization] = await Promise.all([
    getMembership(session.userID, session.organizationID),
    getOrganization(session.organizationID),
  ])
  return {
    name: membership?.user.name ?? "",
    email: session.email,
    role: membership?.role ?? "member",
    organizationName: organization?.name ?? "",
    organizationSlug: organization?.slug ?? "",
  }
}, "profile")
