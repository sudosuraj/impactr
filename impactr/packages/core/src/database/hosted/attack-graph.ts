export * as HostedAttackGraph from "./attack-graph"

import { Effect } from "effect"
import { and, eq, or, inArray } from "drizzle-orm"
import type { GraphState, Node, Edge, NodeStatus } from "../../attack-graph/graph"
import type { EngagementSchema } from "../../engagement/schema"
import type { SessionSchema } from "../../session/schema"
import type { HostedDatabase } from "../hosted-database"
import { HostedAttackGraphEdgeTable, HostedAttackGraphNodeTable } from "./pentest-sql"

/**
 * Engagement-scoped counterpart of attack-graph/graph.ts, operating against the hosted
 * database. A node/edge id is unique per engagement (not per session), so every session
 * that shares an engagement contributes to one unified graph. Plain functions rather than
 * an Effect Context.Service: callers already hold `db` from session/hosted-context.ts's
 * `resolve`, which only returns it once a hosted DB is actually configured.
 */

type NodeRow = typeof HostedAttackGraphNodeTable.$inferSelect

const toNode = (row: NodeRow): Node => ({
  id: row.id,
  type: row.type,
  label: row.label,
  attributes: row.attributes,
  status: row.status,
  discoveredAt: row.discovered_at,
  loopCount: row.loop_count,
})

const readNode = (db: HostedDatabase.DatabaseShape, engagementId: EngagementSchema.ID, id: string) =>
  db
    .select()
    .from(HostedAttackGraphNodeTable)
    .where(and(eq(HostedAttackGraphNodeTable.engagement_id, engagementId), eq(HostedAttackGraphNodeTable.id, id)))
    .get()
    .pipe(Effect.orDie)

export const addNode = (
  db: HostedDatabase.DatabaseShape,
  engagementId: EngagementSchema.ID,
  sessionId: SessionSchema.ID,
  nodeInfo: Omit<Node, "discoveredAt" | "loopCount">,
) =>
  Effect.gen(function* () {
    const existing = yield* readNode(db, engagementId, nodeInfo.id)
    if (existing) {
      const loopCount = existing.loop_count + 1
      yield* db
        .update(HostedAttackGraphNodeTable)
        .set({ loop_count: loopCount })
        .where(
          and(eq(HostedAttackGraphNodeTable.engagement_id, engagementId), eq(HostedAttackGraphNodeTable.id, nodeInfo.id)),
        )
        .pipe(Effect.orDie)
      return toNode({ ...existing, loop_count: loopCount })
    }
    const node: Node = { ...nodeInfo, discoveredAt: Date.now(), loopCount: 0 }
    yield* db
      .insert(HostedAttackGraphNodeTable)
      .values({
        engagement_id: engagementId,
        session_id: sessionId,
        id: node.id,
        type: node.type,
        label: node.label,
        attributes: node.attributes,
        status: node.status,
        discovered_at: node.discoveredAt,
        loop_count: node.loopCount,
      })
      .pipe(Effect.orDie)
    return node
  })

export const updateNodeStatus = (
  db: HostedDatabase.DatabaseShape,
  engagementId: EngagementSchema.ID,
  id: string,
  status: NodeStatus,
) =>
  Effect.gen(function* () {
    const existing = yield* readNode(db, engagementId, id)
    if (!existing) return undefined
    yield* db
      .update(HostedAttackGraphNodeTable)
      .set({ status })
      .where(and(eq(HostedAttackGraphNodeTable.engagement_id, engagementId), eq(HostedAttackGraphNodeTable.id, id)))
      .pipe(Effect.orDie)
    return toNode({ ...existing, status })
  })

export const addEdge = (
  db: HostedDatabase.DatabaseShape,
  engagementId: EngagementSchema.ID,
  sessionId: SessionSchema.ID,
  edge: Edge,
) =>
  db
    .insert(HostedAttackGraphEdgeTable)
    .values({
      engagement_id: engagementId,
      session_id: sessionId,
      source: edge.source,
      target: edge.target,
      relation: edge.relation,
      attributes: edge.attributes,
    })
    .onConflictDoNothing()
    .pipe(Effect.orDie, Effect.asVoid)

export const getGraph = (db: HostedDatabase.DatabaseShape, engagementId: EngagementSchema.ID): Effect.Effect<GraphState> =>
  Effect.gen(function* () {
    const nodeRows = yield* db
      .select()
      .from(HostedAttackGraphNodeTable)
      .where(eq(HostedAttackGraphNodeTable.engagement_id, engagementId))
      .pipe(Effect.orDie)
    const edgeRows = yield* db
      .select()
      .from(HostedAttackGraphEdgeTable)
      .where(eq(HostedAttackGraphEdgeTable.engagement_id, engagementId))
      .pipe(Effect.orDie)
    const nodes: Record<string, Node> = {}
    for (const row of nodeRows) nodes[row.id] = toNode(row)
    const edges: Edge[] = edgeRows.map((row) => ({
      source: row.source,
      target: row.target,
      relation: row.relation,
      attributes: row.attributes,
    }))
    return { nodes, edges }
  })

export const getNode = (db: HostedDatabase.DatabaseShape, engagementId: EngagementSchema.ID, id: string) =>
  readNode(db, engagementId, id).pipe(Effect.map((row) => (row ? toNode(row) : undefined)))

export const getNeighbors = (db: HostedDatabase.DatabaseShape, engagementId: EngagementSchema.ID, id: string) =>
  Effect.gen(function* () {
    const edgeRows = yield* db
      .select()
      .from(HostedAttackGraphEdgeTable)
      .where(
        and(
          eq(HostedAttackGraphEdgeTable.engagement_id, engagementId),
          or(eq(HostedAttackGraphEdgeTable.source, id), eq(HostedAttackGraphEdgeTable.target, id)),
        ),
      )
      .pipe(Effect.orDie)
    const neighborIds = [...new Set(edgeRows.map((row) => (row.source === id ? row.target : row.source)))]
    if (neighborIds.length === 0) return []
    const rows = yield* db
      .select()
      .from(HostedAttackGraphNodeTable)
      .where(
        and(eq(HostedAttackGraphNodeTable.engagement_id, engagementId), inArray(HostedAttackGraphNodeTable.id, neighborIds)),
      )
      .pipe(Effect.orDie)
    return rows.map(toNode)
  })
