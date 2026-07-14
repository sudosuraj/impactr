export * as Engagement from "./engagement"

import { Schema } from "effect"
import { NonNegativeInt, optional } from "./schema"
import { EngagementID } from "./engagement-id"
import { OrganizationID } from "./organization-id"
import { UserID } from "./user-id"

export const ID = EngagementID
export type ID = typeof ID.Type

export const Status = Schema.Literals(["draft", "authorized", "active", "completed", "revoked"]).annotate({
  identifier: "Engagement.Status",
})
export type Status = typeof Status.Type

export const Scope = Schema.Struct({
  target: Schema.Struct({
    name: Schema.String,
    scope: Schema.String,
    exclusions: Schema.Array(Schema.String),
  }),
}).annotate({ identifier: "Engagement.Scope" })
export interface Scope extends Schema.Schema.Type<typeof Scope> {}

export const Time = Schema.Struct({
  created: NonNegativeInt,
  updated: NonNegativeInt,
}).annotate({ identifier: "Engagement.Time" })
export interface Time extends Schema.Schema.Type<typeof Time> {}

export const Info = Schema.Struct({
  id: ID,
  organizationID: OrganizationID,
  name: Schema.String,
  status: Status,
  scope: Scope,
  authorizedBy: optional(UserID),
  authorizedAt: optional(NonNegativeInt),
  time: Time,
}).annotate({ identifier: "Engagement" })
export interface Info extends Schema.Schema.Type<typeof Info> {}
