import { Context, Effect, Layer, Ref } from "effect"
import { makeGlobalNode } from "../effect/app-node"
import { GraphState, Node, Edge, NodeStatus } from "./schema"

export * from "./schema"

export interface Interface {
  readonly addNode: (node: Omit<Node, "discoveredAt" | "loopCount">) => Effect.Effect<Node>
  readonly updateNodeStatus: (id: string, status: NodeStatus) => Effect.Effect<Node | undefined>
  readonly incrementLoopCount: (id: string) => Effect.Effect<Node | undefined>
  readonly addEdge: (edge: Edge) => Effect.Effect<void>
  readonly getGraph: () => Effect.Effect<GraphState>
  readonly getNode: (id: string) => Effect.Effect<Node | undefined>
  readonly getNeighbors: (id: string) => Effect.Effect<ReadonlyArray<Node>>
}

/**
 * The Attack Graph is a process-global model shared across the orchestrator and
 * its recon/attack subagents so they reason over one map of discovered assets,
 * relationships, and exploitation state. State is in-memory for now; durable
 * per-engagement persistence is a deliberate follow-up.
 */
export class AttackGraph extends Context.Service<AttackGraph, Interface>()("@impactr-ai/core/attack-graph") {}

export const layer = Layer.effect(
  AttackGraph,
  Effect.gen(function* () {
    const state = yield* Ref.make<GraphState>({ nodes: {}, edges: [] })

    return AttackGraph.of({
      addNode: (nodeInfo) =>
        Ref.modify(state, (s) => {
          const existing = s.nodes[nodeInfo.id]
          if (existing) return [existing, s]
          const node: Node = { ...nodeInfo, discoveredAt: Date.now(), loopCount: 0 }
          return [node, { ...s, nodes: { ...s.nodes, [node.id]: node } }]
        }),
      updateNodeStatus: (id, status) =>
        Ref.modify(state, (s) => {
          const node = s.nodes[id]
          if (!node) return [undefined, s]
          const updated = { ...node, status }
          return [updated, { ...s, nodes: { ...s.nodes, [id]: updated } }]
        }),
      incrementLoopCount: (id) =>
        Ref.modify(state, (s) => {
          const node = s.nodes[id]
          if (!node) return [undefined, s]
          const updated = { ...node, loopCount: node.loopCount + 1 }
          return [updated, { ...s, nodes: { ...s.nodes, [id]: updated } }]
        }),
      addEdge: (edge) =>
        Ref.update(state, (s) => {
          if (s.edges.some((e) => e.source === edge.source && e.target === edge.target && e.relation === edge.relation))
            return s
          return { ...s, edges: [...s.edges, edge] }
        }),
      getGraph: () => Ref.get(state),
      getNode: (id) => Ref.get(state).pipe(Effect.map((s) => s.nodes[id])),
      getNeighbors: (id) =>
        Ref.get(state).pipe(
          Effect.map((s) => {
            const targets = s.edges.filter((e) => e.source === id).map((e) => e.target)
            const sources = s.edges.filter((e) => e.target === id).map((e) => e.source)
            const neighborIds = [...new Set([...targets, ...sources])]
            return neighborIds.map((n) => s.nodes[n]).filter((n): n is Node => n !== undefined)
          }),
        ),
    })
  }),
)

export const node = makeGlobalNode({
  service: AttackGraph,
  layer,
  deps: [],
})
