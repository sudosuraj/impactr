import { Schema } from "effect"
import { descending } from "./identifier"
import { statics } from "./schema"

export const OrganizationID = Schema.String.check(Schema.isStartsWith("org")).pipe(
  Schema.brand("OrganizationID"),
  statics((schema) => {
    const create = () => schema.make("org_" + descending())
    return {
      create,
      descending: (id?: string) => (id === undefined ? create() : schema.make(id)),
    }
  }),
)
export type OrganizationID = typeof OrganizationID.Type
