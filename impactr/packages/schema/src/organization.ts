export * as Organization from "./organization"

import { Schema } from "effect"
import { NonNegativeInt, optional } from "./schema"
import { OrganizationID } from "./organization-id"
import { UserID } from "./user-id"

export const ID = OrganizationID
export type ID = typeof ID.Type

export const Time = Schema.Struct({
  created: NonNegativeInt,
  updated: NonNegativeInt,
}).annotate({ identifier: "Organization.Time" })
export interface Time extends Schema.Schema.Type<typeof Time> {}

export const Info = Schema.Struct({
  id: ID,
  name: Schema.String,
  slug: Schema.String,
  time: Time,
}).annotate({ identifier: "Organization" })
export interface Info extends Schema.Schema.Type<typeof Info> {}

export const Role = Schema.Literals(["owner", "admin", "member"]).annotate({ identifier: "Organization.Role" })
export type Role = typeof Role.Type

export const Membership = Schema.Struct({
  organizationID: ID,
  userID: UserID,
  role: Role,
  time: Time,
}).annotate({ identifier: "Organization.Membership" })
export interface Membership extends Schema.Schema.Type<typeof Membership> {}
