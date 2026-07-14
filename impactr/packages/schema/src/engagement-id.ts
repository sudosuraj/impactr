import { Schema } from "effect"
import { descending } from "./identifier"
import { statics } from "./schema"

export const EngagementID = Schema.String.check(Schema.isStartsWith("eng")).pipe(
  Schema.brand("EngagementID"),
  statics((schema) => {
    const create = () => schema.make("eng_" + descending())
    return {
      create,
      descending: (id?: string) => (id === undefined ? create() : schema.make(id)),
    }
  }),
)
export type EngagementID = typeof EngagementID.Type
