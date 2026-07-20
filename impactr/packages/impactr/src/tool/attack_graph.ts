import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { AttackGraph } from "@impactr-ai/core/attack-graph/graph"
import type { NodeType, NodeStatus, EdgeRelation } from "@impactr-ai/core/attack-graph/schema"
import { findChains, renderChains } from "./attack-chains"
import { Session } from "@/session/session"
import { engagementRoot } from "./engagement-session"

export const Parameters = Schema.Struct({
  action: Schema.Literals(["add_node", "add_edge", "update_status", "query", "get_node", "chains"]).annotate({ description: "The action to perform." }),
  limit: Schema.optional(Schema.Number).annotate({ description: "For 'chains': max number of chains to return (default 15)." }),
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
    const graph = yield* AttackGraph
    const sessions = yield* Session.Service
    return {
    description: "Interact with the session's Attack Graph — your persistent map of discovered assets and their state. Add nodes (targets, findings), add edges (relationships), update node status, query the graph to understand your current pentesting state, or surface exploit chains — composed paths like subdomain --exposes--> endpoint --vulnerable_to--> RCE, ranked by severity. The technique tools also populate this graph, so it is the single shared source of truth.",
    parameters: Parameters,
    execute: ({ action, nodeId, nodeType, nodeLabel, nodeAttributes, nodeStatus, source, target, relation, limit }, ctx) => Effect.gen(function* () {
      const sid = yield* engagementRoot(sessions, ctx.sessionID as string)
      if (action === "add_node") {
        if (!nodeId || !nodeType || !nodeLabel || !nodeStatus) return "Error: nodeId, nodeType, nodeLabel, and nodeStatus are required to add a node."
        const node = yield* graph.addNode(sid, {
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
        yield* graph.addEdge(sid, {
          source,
          target,
          relation: relation as EdgeRelation,
          attributes: nodeAttributes ?? {},
        })
        return `Edge added: ${source} --[${relation}]--> ${target}`
      }

      if (action === "update_status") {
        if (!nodeId || !nodeStatus) return "Error: nodeId and nodeStatus are required to update a node."
        const node = yield* graph.updateNodeStatus(sid, nodeId, nodeStatus as NodeStatus)
        return node ? `Node ${nodeId} status updated to ${nodeStatus}.` : `Node ${nodeId} not found.`
      }

      if (action === "get_node") {
        if (!nodeId) return "Error: nodeId is required."
        const node = yield* graph.getNode(sid, nodeId)
        if (!node) return `Node ${nodeId} not found.`
        const neighbors = yield* graph.getNeighbors(sid, nodeId)
        return `Node Info:\n${JSON.stringify(node, null, 2)}\n\nNeighbors:\n${JSON.stringify(neighbors.map(n => n.id), null, 2)}`
      }

      if (action === "query") {
        const state = yield* graph.getGraph(sid)
        const nodes = Object.values(state.nodes)
        const byStatus = nodes.reduce<Record<string, number>>((acc, n) => {
          acc[n.status] = (acc[n.status] ?? 0) + 1
          return acc
        }, {})
        const statusLine = Object.entries(byStatus).map(([s, c]) => `${s}: ${c}`).join(", ")
        const list = (label: string, ids: string[]) =>
          ids.length === 0 ? "" : `\n${label}:\n${ids.slice(0, 20).map((id) => `- ${id}`).join("\n")}${ids.length > 20 ? `\n… and ${ids.length - 20} more` : ""}`
        const compromised = nodes.filter((n) => n.status === "compromised").map((n) => n.id)
        const active = nodes.filter((n) => n.status === "enumerating" || n.status === "exploiting").map((n) => n.id)
        return `Attack Graph Summary:\nTotal Nodes: ${nodes.length} | Total Edges: ${state.edges.length}\nStatus: ${statusLine || "none"}${list("Compromised", compromised)}${list("Active", active)}\n\n(Use get_node <id> for a node's full detail and neighbors.)`
      }

      if (action === "chains") {
        const state = yield* graph.getGraph(sid)
        const chains = findChains(state, limit ?? 15)
        return renderChains(chains)
      }

      return "Unknown action."
    }).pipe(
      Effect.catch((e: unknown) => Effect.succeed(`Error: ${e instanceof Error ? e.message : String(e)}`)),
      Effect.map((output) => ({ title: `attack_graph: ${action}`, metadata: {}, output })),
    ),
    }
  })
)
