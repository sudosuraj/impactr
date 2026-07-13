import { Schema } from "effect"

export const NodeType = Schema.Literals(["ip", "port", "subdomain", "endpoint", "credential", "vulnerability"])
export type NodeType = Schema.Schema.Type<typeof NodeType>

export const NodeStatus = Schema.Literals(["pending", "enumerating", "exploiting", "compromised", "dead_end"])
export type NodeStatus = Schema.Schema.Type<typeof NodeStatus>

export const Node = Schema.Struct({
  id: Schema.String,
  type: NodeType,
  label: Schema.String,
  attributes: Schema.Record(Schema.String, Schema.Unknown),
  status: NodeStatus,
  discoveredAt: Schema.Number,
  loopCount: Schema.Number.annotate({ description: "Used by Stuck Detector" }),
})
export type Node = Schema.Schema.Type<typeof Node>

export const EdgeRelation = Schema.Literals(["resolves_to", "hosts", "exposes", "uses", "vulnerable_to"])
export type EdgeRelation = Schema.Schema.Type<typeof EdgeRelation>

export const Edge = Schema.Struct({
  source: Schema.String,
  target: Schema.String,
  relation: EdgeRelation,
  attributes: Schema.Record(Schema.String, Schema.Unknown),
})
export type Edge = Schema.Schema.Type<typeof Edge>

export const GraphState = Schema.Struct({
  nodes: Schema.Record(Schema.String, Node),
  edges: Schema.Array(Edge),
})
export type GraphState = Schema.Schema.Type<typeof GraphState>
