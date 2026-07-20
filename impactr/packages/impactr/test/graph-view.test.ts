import { describe, expect, test } from "bun:test"
import {
  buildColumns,
  neighborIds,
  locate,
  nodeAt,
  navigate,
  describeSelection,
  buildCells,
  type ViewNode,
  type ViewEdge,
} from "../src/cli/cmd/graph-view"

const nodes: ViewNode[] = [
  { id: "s1", type: "subdomain", label: "app.acme.com", status: "enumerating" },
  { id: "s2", type: "subdomain", label: "api.acme.com", status: "pending" },
  { id: "h1", type: "ip", label: "10.0.0.1", status: "compromised" },
  { id: "p1", type: "port", label: "443/https", status: "enumerating" },
  { id: "v1", type: "vulnerability", label: "SQL injection in login form param", status: "compromised" },
]
const edges: ViewEdge[] = [
  { source: "s1", target: "h1" },
  { source: "h1", target: "p1" },
  { source: "p1", target: "v1" },
]

describe("buildColumns", () => {
  test("groups nodes into typed columns in kill-chain order, dropping empty layers", () => {
    const cols = buildColumns(nodes)
    expect(cols.map((c) => c.type)).toEqual(["subdomain", "ip", "port", "vulnerability"])
    expect(cols[0].nodes.map((n) => n.id)).toEqual(["s1", "s2"])
  })

  test("caps each column height", () => {
    const many: ViewNode[] = Array.from({ length: 30 }, (_, i) => ({
      id: `n${i}`,
      type: "subdomain",
      label: `n${i}`,
      status: "pending",
    }))
    expect(buildColumns(many, 24)[0].nodes).toHaveLength(24)
  })
})

describe("neighborIds", () => {
  test("collects both-direction neighbors and excludes self", () => {
    expect([...neighborIds(edges, "h1")].sort()).toEqual(["p1", "s1"])
    expect(neighborIds(edges, "h1").has("h1")).toBe(false)
  })
})

describe("locate / nodeAt", () => {
  test("locate returns grid coordinates and nodeAt is its inverse", () => {
    const cols = buildColumns(nodes)
    const at = locate(cols, "s2")!
    expect(at).toEqual({ col: 0, row: 1 })
    expect(nodeAt(cols, at.col, at.row)).toBe("s2")
  })

  test("locate is undefined for an unknown id", () => {
    expect(locate(buildColumns(nodes), "nope")).toBeUndefined()
  })
})

describe("navigate", () => {
  const cols = buildColumns(nodes)

  test("moves within a column and clamps at the top", () => {
    expect(navigate(cols, "s2", "up")).toBe("s1")
    expect(navigate(cols, "s1", "up")).toBe("s1")
  })

  test("moves across columns, clamping the row into the destination", () => {
    // From s2 (col 0, row 1) rightward lands in the ip column which has one node → row clamps to 0.
    expect(navigate(cols, "s2", "right")).toBe("h1")
    // Left from the first column stays put.
    expect(navigate(cols, "s1", "left")).toBe("s1")
  })

  test("falls back to the first node when the current id is unknown or undefined", () => {
    expect(navigate(cols, undefined, "down")).toBe("s1")
    expect(navigate(cols, "gone", "right")).toBe("s1")
  })

  test("returns undefined for an empty graph", () => {
    expect(navigate([], "x", "down")).toBeUndefined()
  })
})

describe("describeSelection", () => {
  test("summarizes the selected node's status and linked labels", () => {
    const cols = buildColumns(nodes)
    const summary = describeSelection(cols, edges, "h1")!
    expect(summary.node.label).toBe("10.0.0.1")
    expect(summary.neighborCount).toBe(2)
    expect([...summary.neighborLabels].sort()).toEqual(["443/https", "app.acme.com"])
  })

  test("is undefined when nothing is selected", () => {
    expect(describeSelection(buildColumns(nodes), edges, undefined)).toBeUndefined()
  })
})

describe("buildCells", () => {
  test("marks the selected node and its neighbors, truncating long labels", () => {
    const cols = buildColumns(nodes)
    const cells = buildCells(cols, edges, "h1", 18)
    const flat = cells.flat()
    expect(flat.find((c) => c.id === "h1")!.emphasis).toBe("selected")
    expect(flat.find((c) => c.id === "s1")!.emphasis).toBe("neighbor")
    expect(flat.find((c) => c.id === "p1")!.emphasis).toBe("neighbor")
    expect(flat.find((c) => c.id === "s2")!.emphasis).toBe("normal")
    // The long vuln label is truncated with an ellipsis.
    expect(flat.find((c) => c.id === "v1")!.text).toContain("…")
  })

  test("with no selection everything is normal emphasis", () => {
    const cells = buildCells(buildColumns(nodes), edges, undefined)
    expect(cells.flat().every((c) => c.emphasis === "normal")).toBe(true)
  })
})
