export * as EngagementSchema from "./schema"

import { Engagement } from "@impactr-ai/schema/engagement"

export const ID = Engagement.ID
export type ID = typeof ID.Type

export const Info = Engagement.Info
export type Info = Engagement.Info

export const Status = Engagement.Status
export type Status = Engagement.Status

export const Scope = Engagement.Scope
export type Scope = Engagement.Scope
