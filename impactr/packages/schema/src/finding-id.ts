import { Schema } from "effect"
import { descending } from "./identifier"
import { statics } from "./schema"

export const FindingID = Schema.String.check(Schema.isStartsWith("find")).pipe(
  Schema.brand("FindingID"),
  statics((schema) => {
    const create = () => schema.make("find_" + descending())
    return {
      create,
      descending: (id?: string) => (id === undefined ? create() : schema.make(id)),
    }
  }),
)
export type FindingID = typeof FindingID.Type
