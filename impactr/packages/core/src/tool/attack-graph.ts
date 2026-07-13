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
                        const node = yield* graph.addNode({
                          id: input.nodeId,
                          type: input.nodeType,
                          label: input.nodeLabel,
                          attributes: input.nodeAttributes ?? {},
                          status: input.nodeStatus,
                        })
                        summary = `Node added/retrieved:\n${JSON.stringify(node, null, 2)}`
                        break
                      }
                      case "add_edge": {
                        if (!input.source || !input.target || !input.relation) {
                          summary = "Error: source, target, and relation are required to add an edge."
                          break
                        }
                        yield* graph.addEdge({
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
                        const node = yield* graph.updateNodeStatus(input.nodeId, input.nodeStatus)
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
                        const node = yield* graph.getNode(input.nodeId)
                        if (!node) {
                          summary = `Node ${input.nodeId} not found.`
                          break
                        }
                        const neighbors = yield* graph.getNeighbors(input.nodeId)
                        summary = `Node Info:\n${JSON.stringify(node, null, 2)}\n\nNeighbors:\n${JSON.stringify(
                          neighbors.map((n) => n.id),
                          null,
                          2,
                        )}`
                        break
                      }
                      case "query": {
                        const graphState = yield* graph.getGraph()
                        summary = `Attack Graph Summary:\nTotal Nodes: ${
                          Object.keys(graphState.nodes).length
                        }\nTotal Edges: ${graphState.edges.length}\n\nNodes:\n${JSON.stringify(
                          graphState.nodes,
                          null,
                          2,
                        )}\n\nEdges:\n${JSON.stringify(graphState.edges, null, 2)}`
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
