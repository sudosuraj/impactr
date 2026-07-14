export * as AsmAsset from "./asm-asset"

import { Schema } from "effect"
import { NonNegativeInt } from "./schema"
import { AsmAssetID } from "./asm-asset-id"
import { EngagementID } from "./engagement-id"

export const ID = AsmAssetID
export type ID = typeof ID.Type

export const Type = Schema.Literals(["domain", "subdomain", "ip", "url", "service"]).annotate({
  identifier: "AsmAsset.Type",
})
export type Type = typeof Type.Type

export const Time = Schema.Struct({
  created: NonNegativeInt,
  updated: NonNegativeInt,
}).annotate({ identifier: "AsmAsset.Time" })
export interface Time extends Schema.Schema.Type<typeof Time> {}

export const Info = Schema.Struct({
  id: ID,
  engagementID: EngagementID,
  type: Type,
  value: Schema.String,
  attributes: Schema.Record(Schema.String, Schema.Unknown),
  discoveredAt: NonNegativeInt,
  time: Time,
}).annotate({ identifier: "AsmAsset" })
export interface Info extends Schema.Schema.Type<typeof Info> {}
