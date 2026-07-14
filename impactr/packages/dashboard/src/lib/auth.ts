import { action, redirect } from "@solidjs/router"
import { eq } from "drizzle-orm"
import { db, MembershipTable, UserTable } from "./db"
import { useAuthSession } from "./session"

/**
 * Stub login for issue #6 — resolves email -> user -> membership -> organization with no
 * password check. This is intentionally insecure and exists only to exercise the dashboard
 * against real per-org data before issue #5 lands. Replace the credential check here; the
 * user/membership/organization resolution below should stay as-is.
 */
export const login = action(async (formData: FormData) => {
  "use server"
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  if (!email) return { error: "Email is required" }

  const user = await db.select().from(UserTable).where(eq(UserTable.email, email)).get()
  if (!user) return { error: "No account found for that email" }

  const membership = await db.select().from(MembershipTable).where(eq(MembershipTable.user_id, user.id)).get()
  if (!membership) return { error: "That account has no organization membership" }

  const session = await useAuthSession()
  await session.update({
    userID: user.id,
    email: user.email,
    organizationID: membership.organization_id,
  })

  throw redirect("/findings")
}, "login")

export const logout = action(async () => {
  "use server"
  const session = await useAuthSession()
  await session.clear()
  throw redirect("/login")
}, "logout")

/**
 * Server-only guard: call from within a route's own `query()`-wrapped loader to require a
 * session. Deliberately a plain function, not a router `query()` — nesting one query() call
 * inside another's server function does not propagate the throw redirect() correctly.
 */
export async function requireSession() {
  "use server"
  const session = await useAuthSession()
  if (!session.data.organizationID) throw redirect("/login")
  return session.data as Required<typeof session.data>
}
