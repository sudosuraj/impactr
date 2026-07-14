import { requireApiSession } from "~/lib/auth"
import { getAttackGraphSummary } from "~/lib/queries"

export async function GET() {
  const session = await requireApiSession()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const summary = await getAttackGraphSummary(session.organizationID)
  return Response.json(summary)
}
