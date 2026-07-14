import { Schema } from "effect"
import { descending } from "./identifier"
import { statics } from "./schema"

export const AsmAssetID = Schema.String.check(Schema.isStartsWith("asset")).pipe(
  Schema.brand("AsmAssetID"),
  statics((schema) => {
    const create = () => schema.make("asset_" + descending())
    return {
      create,
      descending: (id?: string) => (id === undefined ? create() : schema.make(id)),
    }
  }),
)
export type AsmAssetID = typeof AsmAssetID.Type
