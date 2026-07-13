import { Context, Effect, Layer, Ref } from "effect"
import { GraphState, Node, Edge, NodeType, NodeStatus, EdgeRelation } from "./schema"
export * from "./schema"

export interface Interface {
  readonly addNode: (node: Omit<Node, "discoveredAt" | "loopCount">) => Effect.Effect<Node>
  readonly updateNodeStatus: (id: string, status: NodeStatus) => Effect.Effect<Node>
  readonly incrementLoopCount: (id: string) => Effect.Effect<Node>
  readonly addEdge: (edge: Edge) => Effect.Effect<void>
  readonly getGraph: () => Effect.Effect<GraphState>
  readonly getNode: (id: string) => Effect.Effect<Node | undefined>
  readonly getNeighbors: (id: string) => Effect.Effect<Node[]>
}

export class Service extends Context.Service<Service, Interface>()("@impactr/AttackGraph") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const state = yield* Ref.make<GraphState>({ nodes: {}, edges: [] })

    return Service.of({
      addNode: (nodeInfo) =>
        Ref.modify(state, (s) => {
          if (s.nodes[nodeInfo.id]) {
            return [s.nodes[nodeInfo.id], s]
          }
          const node: Node = {
            ...nodeInfo,
            discoveredAt: Date.now(),
            loopCount: 0,
          }
          const next = {
            ...s,
            nodes: { ...s.nodes, [node.id]: node },
          }
          return [node, next]
        }),
      updateNodeStatus: (id, status) =>
        Ref.modify(state, (s) => {
          const node = s.nodes[id]
          if (!node) throw new Error(`Node ${id} not found`)
          const updated = { ...node, status }
          return [updated, { ...s, nodes: { ...s.nodes, [id]: updated } }]
        }),
      incrementLoopCount: (id) =>
        Ref.modify(state, (s) => {
          const node = s.nodes[id]
          if (!node) throw new Error(`Node ${id} not found`)
          const updated = { ...node, loopCount: node.loopCount + 1 }
          return [updated, { ...s, nodes: { ...s.nodes, [id]: updated } }]
        }),
      addEdge: (edge) =>
        Ref.update(state, (s) => {
          if (s.edges.some((e) => e.source === edge.source && e.target === edge.target && e.relation === edge.relation)) {
            return s
          }
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
            return neighborIds.map((n) => s.nodes[n]).filter((n) => n !== undefined)
          }),
        ),
    })
  }),
)

import { LayerNode } from "@impactr-ai/core/effect/layer-node"
export const node = LayerNode.make({ service: Service, layer, deps: [] })
