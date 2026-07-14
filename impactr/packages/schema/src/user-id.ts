import { Schema } from "effect"
import { descending } from "./identifier"
import { statics } from "./schema"

export const UserID = Schema.String.check(Schema.isStartsWith("usr")).pipe(
  Schema.brand("UserID"),
  statics((schema) => {
    const create = () => schema.make("usr_" + descending())
    return {
      create,
      descending: (id?: string) => (id === undefined ? create() : schema.make(id)),
    }
  }),
)
export type UserID = typeof UserID.Type
