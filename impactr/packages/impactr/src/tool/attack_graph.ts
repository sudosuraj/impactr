import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import * as AttackGraph from "@/attack-graph"
import { NodeType, NodeStatus, EdgeRelation } from "@/attack-graph/schema"

export const Parameters = Schema.Struct({
  action: Schema.Literals(["add_node", "add_edge", "update_status", "query", "get_node"]).annotate({ description: "The action to perform." }),
  nodeId: Schema.optional(Schema.String).annotate({ description: "Unique identifier for the node (e.g., 'ip:192.168.1.1', 'port:80', 'endpoint:/api/login')." }),
  nodeType: Schema.optional(Schema.Literals(["ip", "port", "subdomain", "endpoint", "credential", "vulnerability"])).annotate({ description: "The type of the node." }),
  nodeLabel: Schema.optional(Schema.String).annotate({ description: "Human-readable label for the node." }),
  nodeAttributes: Schema.optional(Schema.Record(Schema.String, Schema.Any)).annotate({ description: "Key-value pairs of additional information." }),
  nodeStatus: Schema.optional(Schema.Literals(["pending", "enumerating", "exploiting", "compromised", "dead_end"])).annotate({ description: "The status of the node." }),
  source: Schema.optional(Schema.String).annotate({ description: "Source node ID for an edge." }),
  target: Schema.optional(Schema.String).annotate({ description: "Target node ID for an edge." }),
  relation: Schema.optional(Schema.Literals(["resolves_to", "hosts", "exposes", "uses", "vulnerable_to"])).annotate({ description: "Relationship type." }),
})

export const AttackGraphTool = Tool.define(
  "attack_graph",
  Effect.gen(function* () {
    const graph = yield* AttackGraph.Service
    return {
    description: "Interact with the global Attack Graph. You can add nodes (targets, findings), add edges (relationships), update node status, or query the graph to understand your current pentesting state.",
    parameters: Parameters,
    execute: ({ action, nodeId, nodeType, nodeLabel, nodeAttributes, nodeStatus, source, target, relation }, ctx) => Effect.gen(function* () {
      if (action === "add_node") {
        if (!nodeId || !nodeType || !nodeLabel || !nodeStatus) return "Error: nodeId, nodeType, nodeLabel, and nodeStatus are required to add a node."
        const node = yield* graph.addNode({
          id: nodeId,
          type: nodeType as NodeType,
          label: nodeLabel,
          attributes: nodeAttributes ?? {},
          status: nodeStatus as NodeStatus,
        })
        return `Node added/retrieved successfully:\n${JSON.stringify(node, null, 2)}`
      }

      if (action === "add_edge") {
        if (!source || !target || !relation) return "Error: source, target, and relation are required to add an edge."
        yield* graph.addEdge({
          source,
          target,
          relation: relation as EdgeRelation,
          attributes: nodeAttributes ?? {},
        })
        return `Edge added: ${source} --[${relation}]--> ${target}`
      }

      if (action === "update_status") {
        if (!nodeId || !nodeStatus) return "Error: nodeId and nodeStatus are required to update a node."
        const node = yield* graph.updateNodeStatus(nodeId, nodeStatus as NodeStatus)
        return `Node ${nodeId} status updated to ${nodeStatus}.`
      }

      if (action === "get_node") {
        if (!nodeId) return "Error: nodeId is required."
        const node = yield* graph.getNode(nodeId)
        if (!node) return `Node ${nodeId} not found.`
        const neighbors = yield* graph.getNeighbors(nodeId)
        return `Node Info:\n${JSON.stringify(node, null, 2)}\n\nNeighbors:\n${JSON.stringify(neighbors.map(n => n.id), null, 2)}`
      }

      if (action === "query") {
        const state = yield* graph.getGraph()
        return `Attack Graph Summary:\nTotal Nodes: ${Object.keys(state.nodes).length}\nTotal Edges: ${state.edges.length}\n\nNodes:\n${JSON.stringify(state.nodes, null, 2)}\n\nEdges:\n${JSON.stringify(state.edges, null, 2)}`
      }

      return "Unknown action."
    }).pipe(
      Effect.catch((e: unknown) => Effect.succeed(`Error: ${e instanceof Error ? e.message : String(e)}`)),
      Effect.map((output) => ({ title: `attack_graph: ${action}`, metadata: {}, output })),
    ),
    }
  })
)
