export * as User from "./user"

import { Schema } from "effect"
import { NonNegativeInt } from "./schema"
import { UserID } from "./user-id"

export const ID = UserID
export type ID = typeof ID.Type

export const Time = Schema.Struct({
  created: NonNegativeInt,
  updated: NonNegativeInt,
}).annotate({ identifier: "User.Time" })
export interface Time extends Schema.Schema.Type<typeof Time> {}

export const Info = Schema.Struct({
  id: ID,
  email: Schema.String,
  name: Schema.String,
  time: Time,
}).annotate({ identifier: "User" })
export interface Info extends Schema.Schema.Type<typeof Info> {}
