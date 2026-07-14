import { requireApiSession } from "~/lib/auth"
import { listAssets } from "~/lib/queries"

export async function GET() {
  const session = await requireApiSession()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const assets = await listAssets(session.organizationID)
  return Response.json(assets)
}
