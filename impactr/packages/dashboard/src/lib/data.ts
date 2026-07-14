import { query } from "@solidjs/router"
import { requireSession } from "./auth"
import { getFinding, listAssets, listFindings } from "./queries"

export const getFindings = query(async () => {
  "use server"
  const session = await requireSession()
  return listFindings(session.organizationID)
}, "findings")

export const getFindingDetail = query(async (id: string) => {
  "use server"
  const session = await requireSession()
  return getFinding(id, session.organizationID)
}, "finding-detail")

export const getAssets = query(async () => {
  "use server"
  const session = await requireSession()
  return listAssets(session.organizationID)
}, "assets")
