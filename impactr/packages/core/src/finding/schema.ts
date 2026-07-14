export * as FindingSchema from "./schema"

import { Finding } from "@impactr-ai/schema/finding"

export const ID = Finding.ID
export type ID = typeof ID.Type

export const Info = Finding.Info
export type Info = Finding.Info

export const Status = Finding.Status
export type Status = Finding.Status

export const Severity = Finding.Severity
export type Severity = Finding.Severity
