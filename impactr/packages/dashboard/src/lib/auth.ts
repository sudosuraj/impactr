import { action, redirect } from "@solidjs/router"
import { eq } from "drizzle-orm"
import { db, MembershipTable, UserTable } from "./db"
import { useAuthSession } from "./session"

// Verified against on a missing user so a failed lookup takes roughly the same time as a
// failed password check — avoids trivially leaking which emails have accounts.
const DUMMY_HASH = await Bun.password.hash(crypto.randomUUID())

export const login = action(async (formData: FormData) => {
  "use server"
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const password = String(formData.get("password") ?? "")
  if (!email || !password) return { error: "Email and password are required" }

  const user = await db.select().from(UserTable).where(eq(UserTable.email, email)).get()
  const valid = await Bun.password.verify(password, user?.password_hash ?? DUMMY_HASH)
  if (!user || !valid) return { error: "Invalid email or password" }

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
