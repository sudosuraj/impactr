import type { APIEvent } from "@solidjs/start"
import { requireApiSession } from "~/lib/auth"
import { getFinding, listFindings } from "~/lib/queries"

/** Finding detail is `?id=` on the same static route rather than a separate `[id]` route file. */
export async function GET(event: APIEvent) {
  const session = await requireApiSession()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const id = new URL(event.request.url).searchParams.get("id")
  if (id) {
    const finding = await getFinding(id, session.organizationID)
    if (!finding) return Response.json({ error: "Not found" })
    return Response.json(finding)
  }

  const findings = await listFindings(session.organizationID)
  return Response.json(findings)
}
