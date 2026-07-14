export * as Finding from "./finding"

import { Schema } from "effect"
import { NonNegativeInt, optional } from "./schema"
import { FindingID } from "./finding-id"
import { EngagementID } from "./engagement-id"
import { SessionID } from "./session-id"
import { UserID } from "./user-id"

export const ID = FindingID
export type ID = typeof ID.Type

export const Severity = Schema.Literals(["info", "low", "medium", "high", "critical"]).annotate({
  identifier: "Finding.Severity",
})
export type Severity = typeof Severity.Type

export const Status = Schema.Literals(["open", "triaged", "remediated", "accepted_risk", "false_positive"]).annotate(
  { identifier: "Finding.Status" },
)
export type Status = typeof Status.Type

export const Time = Schema.Struct({
  created: NonNegativeInt,
  updated: NonNegativeInt,
}).annotate({ identifier: "Finding.Time" })
export interface Time extends Schema.Schema.Type<typeof Time> {}

export const Info = Schema.Struct({
  id: ID,
  sessionID: SessionID,
  engagementID: EngagementID,
  title: Schema.String,
  description: Schema.String,
  cvss: Schema.String,
  impact: Schema.String,
  remediation: Schema.String,
  status: Status,
  severity: Severity,
  assignedTo: optional(UserID),
  time: Time,
}).annotate({ identifier: "Finding" })
export interface Info extends Schema.Schema.Type<typeof Info> {}
