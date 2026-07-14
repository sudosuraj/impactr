import { drizzle } from "drizzle-orm/libsql"
import { FindingTable } from "@impactr-ai/core/finding/hosted-sql"
import { AsmAssetTable } from "@impactr-ai/core/asm-asset/hosted-sql"
import { EngagementTable } from "@impactr-ai/core/engagement/hosted-sql"
import { OrganizationTable, UserTable, MembershipTable } from "@impactr-ai/core/organization/hosted-sql"

const schema = { FindingTable, AsmAssetTable, EngagementTable, OrganizationTable, UserTable, MembershipTable }

const url = process.env.DATABASE_URL
if (!url) throw new Error("DATABASE_URL is required to run the dashboard")

export const db = drizzle({
  connection: { url, authToken: process.env.DATABASE_AUTH_TOKEN },
  schema,
})

export { FindingTable, AsmAssetTable, EngagementTable, OrganizationTable, UserTable, MembershipTable }
