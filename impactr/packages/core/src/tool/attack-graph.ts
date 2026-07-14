export * as AttackGraphTool from "./attack-graph"

import { ToolFailure } from "@impactr-ai/llm"
import { Effect, Layer, Schema } from "effect"
import { makeLocationNode } from "../effect/app-node"
import { ToolRegistry } from "./registry"
import { Tool } from "./tool"
import { Tools } from "./tools"
import { AttackGraph, node as AttackGraphNode, NodeType, NodeStatus, EdgeRelation } from "../attack-graph/graph"
import { PermissionV2 } from "../permission"

export const name = "attack_graph"

/** A node re-added at least this many times signals the agent is looping on one asset. */
const LOOP_THRESHOLD = 3

/** Max neighbor ids listed in a get_node result before truncating. */
const NEIGHBOR_LIMIT = 25

export const description =
  "Interact with the global Attack Graph. Add nodes (targets, findings), add edges (relationships), update node status, or query the graph to understand your current pentesting state."

export const Input = Schema.Struct({
  action: Schema.Literals(["add_node", "add_edge", "update_status", "query", "get_node"]).annotate({
    description: "The action to perform.",
  }),
  nodeId: Schema.String.pipe(Schema.optional).annotate({
    description: "Unique identifier for the node (e.g. 'ip:192.168.1.1', 'port:80', 'endpoint:/api/login').",
  }),
  nodeType: NodeType.pipe(Schema.optional).annotate({ description: "The type of the node." }),
  nodeLabel: Schema.String.pipe(Schema.optional).annotate({ description: "Human-readable label for the node." }),
  nodeAttributes: Schema.Record(Schema.String, Schema.Unknown)
    .pipe(Schema.optional)
    .annotate({ description: "Key-value pairs of additional information." }),
  nodeStatus: NodeStatus.pipe(Schema.optional).annotate({ description: "The status of the node." }),
  source: Schema.String.pipe(Schema.optional).annotate({ description: "Source node ID for an edge." }),
  target: Schema.String.pipe(Schema.optional).annotate({ description: "Target node ID for an edge." }),
  relation: EdgeRelation.pipe(Schema.optional).annotate({ description: "Relationship type." }),
})

export const Output = Schema.Struct({
  action: Schema.String,
  summary: Schema.String,
})
export type Output = typeof Output.Type

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools.Service
    const graph = yield* AttackGraph
    const permission = yield* PermissionV2.Service

    yield* tools
      .register({
        [name]: Tool.make({
          description,
          input: Input,
          output: Output,
          toModelOutput: ({ output }) => [{ type: "text", text: output.summary }],
          execute: (input, context) =>
            permission
              .assert({
                action: "attack_graph",
                resources: ["*"],
                sessionID: context.sessionID,
                agent: context.agent,
                source: { type: "tool", messageID: context.assistantMessageID, callID: context.toolCallID },
              })
              .pipe(
                Effect.mapError(() => new ToolFailure({ message: "Permission denied: attack_graph" })),
                Effect.andThen(
                  Effect.gen(function* () {
                    let summary = "Unknown action."
                    switch (input.action) {
                      case "add_node": {
                        if (!input.nodeId || !input.nodeType || !input.nodeLabel || !input.nodeStatus) {
                          summary = "Error: nodeId, nodeType, nodeLabel, and nodeStatus are required to add a node."
                          break
                        }
                        const node = yield* graph.addNode(context.sessionID, {
                          id: input.nodeId,
                          type: input.nodeType,
                          label: input.nodeLabel,
                          attributes: input.nodeAttributes ?? {},
                          status: input.nodeStatus,
                        })
                        const loopWarning =
                          node.loopCount >= LOOP_THRESHOLD
                            ? `\n\n⚠ Possible loop: this node has been added ${node.loopCount} times. You are circling a known asset — pick a different lead or escalate instead of re-enumerating it.`
                            : ""
                        summary = `Node added/retrieved:\n${JSON.stringify(node, null, 2)}${loopWarning}`
                        break
                      }
                      case "add_edge": {
                        if (!input.source || !input.target || !input.relation) {
                          summary = "Error: source, target, and relation are required to add an edge."
                          break
                        }
                        yield* graph.addEdge(context.sessionID, {
                          source: input.source,
                          target: input.target,
                          relation: input.relation,
                          attributes: input.nodeAttributes ?? {},
                        })
                        summary = `Edge added: ${input.source} --[${input.relation}]--> ${input.target}`
                        break
                      }
                      case "update_status": {
                        if (!input.nodeId || !input.nodeStatus) {
                          summary = "Error: nodeId and nodeStatus are required to update a node."
                          break
                        }
                        const node = yield* graph.updateNodeStatus(context.sessionID, input.nodeId, input.nodeStatus)
                        summary = node
                          ? `Node ${input.nodeId} status updated to ${input.nodeStatus}.`
                          : `Node ${input.nodeId} not found.`
                        break
                      }
                      case "get_node": {
                        if (!input.nodeId) {
                          summary = "Error: nodeId is required."
                          break
                        }
                        const node = yield* graph.getNode(context.sessionID, input.nodeId)
                        if (!node) {
                          summary = `Node ${input.nodeId} not found.`
                          break
                        }
                        const neighbors = yield* graph.getNeighbors(context.sessionID, input.nodeId)
                        const neighborIds = neighbors.map((n) => n.id)
                        // Cap the neighbor list so a high-degree node can't emit
                        // an unbounded id dump into the model context.
                        const shownNeighbors = neighborIds.slice(0, NEIGHBOR_LIMIT)
                        const neighborsText =
                          neighborIds.length > NEIGHBOR_LIMIT
                            ? `${JSON.stringify(shownNeighbors, null, 2)}\n… and ${
                                neighborIds.length - NEIGHBOR_LIMIT
                              } more`
                            : JSON.stringify(shownNeighbors, null, 2)
                        summary = `Node Info:\n${JSON.stringify(node, null, 2)}\n\nNeighbors:\n${neighborsText}`
                        break
                      }
                      case "query": {
                        const graphState = yield* graph.getGraph(context.sessionID)
                        const nodes = Object.values(graphState.nodes)
                        // A bounded, decision-oriented digest. Dumping the full
                        // node/edge set as JSON grows the model context without
                        // bound as an engagement runs; use get_node for detail.
                        const byStatus = nodes.reduce<Record<string, number>>((acc, n) => {
                          acc[n.status] = (acc[n.status] ?? 0) + 1
                          return acc
                        }, {})
                        const statusLine = Object.entries(byStatus)
                          .map(([status, count]) => `${status}: ${count}`)
                          .join(", ")
                        const list = (label: string, ids: string[]) =>
                          ids.length === 0
                            ? ""
                            : `\n${label}:\n${ids.slice(0, 15).map((id) => `- ${id}`).join("\n")}${
                                ids.length > 15 ? `\n… and ${ids.length - 15} more` : ""
                              }`
                        const compromised = nodes.filter((n) => n.status === "compromised").map((n) => n.id)
                        const active = nodes
                          .filter((n) => n.status === "enumerating" || n.status === "exploiting")
                          .map((n) => n.id)
                        const stuck = nodes.filter((n) => n.loopCount >= LOOP_THRESHOLD)
                        const stuckSection =
                          stuck.length === 0
                            ? ""
                            : `\n⚠ Stuck (loopCount >= ${LOOP_THRESHOLD}):\n${stuck
                                .slice(0, 15)
                                .map((n) => `- ${n.id} (${n.loopCount})`)
                                .join("\n")}`
                        summary = `Attack Graph Summary:\nTotal Nodes: ${nodes.length} | Total Edges: ${
                          graphState.edges.length
                        }\nStatus: ${statusLine || "none"}${list("Compromised", compromised)}${list(
                          "Active",
                          active,
                        )}${stuckSection}\n\n(Use get_node <id> for a node's full detail and neighbors.)`
                        break
                      }
                    }
                    return { action: input.action as string, summary }
                  }),
                ),
              ),
        }),
      })
      .pipe(Effect.orDie)
  }),
)

export const node = makeLocationNode({
  name: "tool/attack-graph",
  layer,
  deps: [ToolRegistry.node, PermissionV2.node, AttackGraphNode],
})
