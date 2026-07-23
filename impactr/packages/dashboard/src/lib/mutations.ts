import { action, redirect } from "@solidjs/router"
import { Identifier } from "@impactr-ai/core/id/id"
import type { EngagementSchema } from "@impactr-ai/core/engagement/schema"
import { requireSession } from "./auth"
import { db, EngagementTable, EngagementAuditLogTable } from "./db"

/**
 * Creates and authorizes a new engagement in one step: a dashboard user submitting this form is
 * the human authorization (matches the CLI's set_scope + `impactr engagement authorize` pair, but
 * collapsed into one action since there's no separate "draft, then approve" step here yet).
 *
 * Does not yet start a live agent session against the target -- see CLAUDE.md's web-surface
 * section for why that needs a workspace/Location decision this action doesn't make on its own.
 */
export const createEngagement = action(async (formData: FormData) => {
  "use server"
  const session = await requireSession()

  const name = String(formData.get("name") ?? "").trim()
  const target = String(formData.get("target") ?? "").trim()
  const scopeInput = String(formData.get("scope") ?? "").trim()
  const exclusionsInput = String(formData.get("exclusions") ?? "").trim()

  if (!name || !target) return { error: "Name and target are required" }

  const exclusions = exclusionsInput
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)

  const scope: EngagementSchema.Scope = {
    target: { name: target, scope: scopeInput || target, exclusions },
  }

  const id = Identifier.create("eng", "ascending") as EngagementSchema.ID
  const now = Date.now()

  await db.insert(EngagementTable).values({
    id,
    organization_id: session.organizationID as any,
    name,
    status: "authorized",
    scope,
    authorized_by: session.userID as any,
    authorized_at: now,
    time_created: now,
    time_updated: now,
  })

  await db.insert(EngagementAuditLogTable).values({
    id: crypto.randomUUID(),
    engagement_id: id,
    actor_user_id: session.userID as any,
    action: "created",
    details: { name, target },
    time_created: now,
  })

  throw redirect(`/scans/${id}`)
}, "create-engagement")
