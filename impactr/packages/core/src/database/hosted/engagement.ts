export * as HostedEngagement from "./engagement"

import { Effect } from "effect"
import { eq } from "drizzle-orm"
import { EngagementTable } from "../../engagement/hosted-sql"
import type { EngagementSchema } from "../../engagement/schema"
import type { HostedDatabase } from "../hosted-database"

export const get = (db: HostedDatabase.DatabaseShape, engagementId: EngagementSchema.ID) =>
  db.select().from(EngagementTable).where(eq(EngagementTable.id, engagementId)).get().pipe(Effect.orDie)
