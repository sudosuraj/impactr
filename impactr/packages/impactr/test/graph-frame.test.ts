import { describe, expect, test } from "bun:test"
import { renderFrame, toView } from "../src/cli/cmd/graph"
import type { ViewEdge, ViewNode } from "../src/cli/cmd/graph-view"

// eslint-disable-next-line no-control-regex
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")

const nodes: ViewNode[] = [
  { id: "h1", type: "ip", label: "10.0.0.1", status: "compromised" },
  { id: "p1", type: "port", label: "443/https", status: "enumerating" },
]
const edges: ViewEdge[] = [{ source: "h1", target: "p1" }]

describe("toView", () => {
  test("maps a GraphState record into flat node and edge arrays", () => {
    const view = toView({
      nodes: {
        h1: { id: "h1", type: "ip", label: "10.0.0.1", attributes: {}, status: "compromised", discoveredAt: 0, loopCount: 0 },
      },
      edges: [{ source: "h1", target: "p1", relation: "exposes", attributes: {} }],
    })
    expect(view.nodes).toEqual([{ id: "h1", type: "ip", label: "10.0.0.1", status: "compromised" }])
    expect(view.edges).toEqual([{ source: "h1", target: "p1" }])
  })
})

describe("renderFrame", () => {
  test("shows an empty-state message and quit hint when there are no nodes", () => {
    const plain = stripAnsi(renderFrame([], [], undefined, 1500, "demo"))
    expect(plain).toContain("attack graph is empty")
    expect(plain).toContain("q quit")
  })

  test("renders column headers, the selected node's footer, and the help line", () => {
    const plain = stripAnsi(renderFrame(nodes, edges, "h1", 2000, "engagement-x"))
    expect(plain).toContain("HOSTS")
    expect(plain).toContain("SERVICES")
    expect(plain).toContain("10.0.0.1")
    // Footer summarizes the selected node and its link.
    expect(plain).toContain("[compromised]")
    expect(plain).toContain("links: 443/https")
    expect(plain).toContain("live every 2.0s")
    expect(plain).toContain("2 assets")
  })

  test("emphasizes the selected node with a reverse-video escape", () => {
    const framed = renderFrame(nodes, edges, "h1", 1500, "x")
    expect(framed).toContain("\x1b[7m") // reverse video wraps the selected cell
  })
})
