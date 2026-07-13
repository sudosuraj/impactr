import { Context, Effect, Layer } from "effect"
import { and, eq, or } from "drizzle-orm"
import { Database } from "../database/database"
import { makeGlobalNode } from "../effect/app-node"
import { GraphState, Node, Edge, NodeStatus } from "./schema"
import { AttackGraphNodeTable, AttackGraphEdgeTable } from "./sql"

export * from "./schema"

export interface Interface {
  readonly addNode: (sessionId: string, node: Omit<Node, "discoveredAt" | "loopCount">) => Effect.Effect<Node>
  readonly updateNodeStatus: (sessionId: string, id: string, status: NodeStatus) => Effect.Effect<Node | undefined>
  readonly incrementLoopCount: (sessionId: string, id: string) => Effect.Effect<Node | undefined>
  readonly addEdge: (sessionId: string, edge: Edge) => Effect.Effect<void>
  readonly getGraph: (sessionId: string) => Effect.Effect<GraphState>
  readonly getNode: (sessionId: string, id: string) => Effect.Effect<Node | undefined>
  readonly getNeighbors: (sessionId: string, id: string) => Effect.Effect<ReadonlyArray<Node>>
}

/**
 * The Attack Graph is the per-engagement model of discovered assets, their
 * relationships, and exploitation state. It is keyed by session so concurrent
 * engagements never share or corrupt one map, and it is persisted to SQLite so
 * the graph survives process restarts within an engagement.
 */
export class AttackGraph extends Context.Service<AttackGraph, Interface>()("@impactr-ai/core/attack-graph") {}

type NodeRow = typeof AttackGraphNodeTable.$inferSelect

const toNode = (row: NodeRow): Node => ({
  id: row.id,
  type: row.type,
  label: row.label,
  attributes: row.attributes,
  status: row.status,
  discoveredAt: row.discovered_at,
  loopCount: row.loop_count,
})

export const layer = Layer.effect(
  AttackGraph,
  Effect.gen(function* () {
    const { db } = yield* Database.Service

    const readNode = (sessionId: string, id: string) =>
      db
        .select()
        .from(AttackGraphNodeTable)
        .where(and(eq(AttackGraphNodeTable.session_id, sessionId as any), eq(AttackGraphNodeTable.id, id)))
        .get()
        .pipe(Effect.orDie)

    return AttackGraph.of({
      addNode: (sessionId, nodeInfo) =>
        Effect.gen(function* () {
          const existing = yield* readNode(sessionId, nodeInfo.id)
          if (existing) {
            // Re-discovering a known node is a loop signal; count it so the
            // orchestrator can detect when it is stuck circling one asset.
            const loopCount = existing.loop_count + 1
            yield* db
              .update(AttackGraphNodeTable)
              .set({ loop_count: loopCount })
              .where(and(eq(AttackGraphNodeTable.session_id, sessionId as any), eq(AttackGraphNodeTable.id, nodeInfo.id)))
              .pipe(Effect.orDie)
            return toNode({ ...existing, loop_count: loopCount })
          }
          const node: Node = { ...nodeInfo, discoveredAt: Date.now(), loopCount: 0 }
          yield* db
            .insert(AttackGraphNodeTable)
            .values({
              session_id: sessionId as any,
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
        }),

      updateNodeStatus: (sessionId, id, status) =>
        Effect.gen(function* () {
          const existing = yield* readNode(sessionId, id)
          if (!existing) return undefined
          yield* db
            .update(AttackGraphNodeTable)
            .set({ status })
            .where(and(eq(AttackGraphNodeTable.session_id, sessionId as any), eq(AttackGraphNodeTable.id, id)))
            .pipe(Effect.orDie)
          return toNode({ ...existing, status })
        }),

      incrementLoopCount: (sessionId, id) =>
        Effect.gen(function* () {
          const existing = yield* readNode(sessionId, id)
          if (!existing) return undefined
          const loopCount = existing.loop_count + 1
          yield* db
            .update(AttackGraphNodeTable)
            .set({ loop_count: loopCount })
            .where(and(eq(AttackGraphNodeTable.session_id, sessionId as any), eq(AttackGraphNodeTable.id, id)))
            .pipe(Effect.orDie)
          return toNode({ ...existing, loop_count: loopCount })
        }),

      addEdge: (sessionId, edge) =>
        db
          .insert(AttackGraphEdgeTable)
          .values({
            session_id: sessionId as any,
            source: edge.source,
            target: edge.target,
            relation: edge.relation,
            attributes: edge.attributes,
          })
          .onConflictDoNothing()
          .pipe(Effect.orDie, Effect.asVoid),

      getGraph: (sessionId) =>
        Effect.gen(function* () {
          const nodeRows = yield* db
            .select()
            .from(AttackGraphNodeTable)
            .where(eq(AttackGraphNodeTable.session_id, sessionId as any))
            .pipe(Effect.orDie)
          const edgeRows = yield* db
            .select()
            .from(AttackGraphEdgeTable)
            .where(eq(AttackGraphEdgeTable.session_id, sessionId as any))
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
        }),

      getNode: (sessionId, id) => readNode(sessionId, id).pipe(Effect.map((row) => (row ? toNode(row) : undefined))),

      getNeighbors: (sessionId, id) =>
        Effect.gen(function* () {
          const edgeRows = yield* db
            .select()
            .from(AttackGraphEdgeTable)
            .where(
              and(
                eq(AttackGraphEdgeTable.session_id, sessionId as any),
                or(eq(AttackGraphEdgeTable.source, id), eq(AttackGraphEdgeTable.target, id)),
              ),
            )
            .pipe(Effect.orDie)
          const neighborIds = [
            ...new Set(edgeRows.map((row) => (row.source === id ? row.target : row.source))),
          ]
          const neighbors = yield* Effect.forEach(neighborIds, (neighborId) => readNode(sessionId, neighborId))
          return neighbors.filter((row): row is NodeRow => row !== undefined).map(toNode)
        }),
    })
  }),
)

export const node = makeGlobalNode({
  service: AttackGraph,
  layer,
  deps: [Database.node],
})
