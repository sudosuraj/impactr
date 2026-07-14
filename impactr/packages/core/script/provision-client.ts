#!/usr/bin/env bun
/**
 * Operator-only CLI to provision a new pentest client: creates an organization, a dashboard
 * login for the client, and an authorized engagement (with an audit trail entry). There is no
 * self-service signup — this is the only way client accounts get created, matching "clients
 * only come and test, nothing else they can configure."
 *
 * Requires DATABASE_URL (and DATABASE_AUTH_TOKEN if remote) for the hosted database.
 *
 * Usage:
 *   bun run script/provision-client.ts \
 *     --org-name "Spreaker" --org-slug spreaker \
 *     --email client@spreaker.com --name "Client Contact" \
 *     --engagement-name "Q3 pentest" --target-name Spreaker --target-scope "*.spreaker.com" \
 *     --exclusions "blog.spreaker.com,help.spreaker.com" \
 *     --authorized-by "Jane, Impactr Ops"
 *
 * Omit --password to have one generated and printed once.
 */
import { parseArgs } from "util"
import { drizzle } from "drizzle-orm/libsql"
import { Organization } from "@impactr-ai/schema/organization"
import { User } from "@impactr-ai/schema/user"
import { Engagement } from "@impactr-ai/schema/engagement"
import { OrganizationTable, UserTable, MembershipTable } from "../src/organization/hosted-sql"
import { EngagementTable, EngagementAuditLogTable } from "../src/engagement/hosted-sql"

const args = parseArgs({
  args: process.argv.slice(2),
  options: {
    "org-name": { type: "string" },
    "org-slug": { type: "string" },
    email: { type: "string" },
    name: { type: "string" },
    password: { type: "string" },
    "engagement-name": { type: "string" },
    "target-name": { type: "string" },
    "target-scope": { type: "string" },
    exclusions: { type: "string", default: "" },
    "authorized-by": { type: "string" },
  },
}).values

for (const required of ["org-name", "org-slug", "email", "name", "engagement-name", "target-name", "target-scope"] as const) {
  if (!args[required]) {
    console.error(`Missing required --${required}`)
    process.exit(1)
  }
}

const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL is required")
  process.exit(1)
}

const db = drizzle({
  connection: { url, authToken: process.env.DATABASE_AUTH_TOKEN },
  schema: { OrganizationTable, UserTable, MembershipTable, EngagementTable, EngagementAuditLogTable },
})

const password = args.password ?? crypto.randomUUID()
const passwordHash = await Bun.password.hash(password)
const now = Date.now()

const organizationID = Organization.ID.create()
const userID = User.ID.create()
const engagementID = Engagement.ID.create()

await db.insert(OrganizationTable).values({
  id: organizationID,
  name: args["org-name"]!,
  slug: args["org-slug"]!,
})

await db.insert(UserTable).values({
  id: userID,
  email: args.email!.toLowerCase(),
  name: args.name!,
  password_hash: passwordHash,
})

await db.insert(MembershipTable).values({
  organization_id: organizationID,
  user_id: userID,
  role: "owner",
})

const exclusions = args.exclusions ? args.exclusions.split(",").map((s) => s.trim()).filter(Boolean) : []

await db.insert(EngagementTable).values({
  id: engagementID,
  organization_id: organizationID,
  name: args["engagement-name"]!,
  status: "authorized",
  scope: { target: { name: args["target-name"]!, scope: args["target-scope"]!, exclusions } },
  authorized_at: now,
})

await db.insert(EngagementAuditLogTable).values({
  id: crypto.randomUUID(),
  engagement_id: engagementID,
  action: "authorized",
  details: { authorizedBy: args["authorized-by"] ?? "unspecified" },
})

console.log("Provisioned:")
console.log(`  organization: ${args["org-name"]} (${organizationID})`)
console.log(`  engagement:   ${args["engagement-name"]} (${engagementID})`)
console.log(`  login email:  ${args.email}`)
if (!args.password) console.log(`  login password (generated, shown once): ${password}`)
