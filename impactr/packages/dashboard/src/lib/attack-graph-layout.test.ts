import { describe, expect, test } from "bun:test"
import {
  computeLayout,
  neighborIds,
  edgeTouches,
  initialView,
  zoomView,
  type LayoutNode,
  type LayoutEdge,
} from "./attack-graph-layout"

const nodes: LayoutNode[] = [
  { id: "s1", type: "subdomain", label: "app.acme.com", status: "enumerating" },
  { id: "h1", type: "ip", label: "10.0.0.1", status: "compromised" },
  { id: "p1", type: "port", label: "443/https", status: "enumerating" },
  { id: "v1", type: "vulnerability", label: "SQLi", status: "compromised" },
]
const edges: LayoutEdge[] = [
  { source: "s1", target: "h1" },
  { source: "h1", target: "p1" },
  { source: "p1", target: "v1" },
  { source: "s1", target: "missing" }, // dangling edge — endpoint not in node set
]

describe("computeLayout", () => {
  test("places each node into its typed column in kill-chain order", () => {
    const layout = computeLayout(nodes, edges)
    expect(layout.layers.map((l) => l.type)).toEqual(["subdomain", "ip", "port", "vulnerability"])
    const x = (id: string) => layout.placed.find((p) => p.id === id)!.x
    // Columns advance left-to-right by layer, so subdomain sits left of ip, ip left of port, etc.
    expect(x("s1")).toBeLessThan(x("h1"))
    expect(x("h1")).toBeLessThan(x("p1"))
    expect(x("p1")).toBeLessThan(x("v1"))
  })

  test("drops edges whose endpoints are not both placed", () => {
    const layout = computeLayout(nodes, edges)
    expect(layout.edges).toHaveLength(3)
    expect(layout.edges.every((e) => e.target !== "missing")).toBe(true)
  })

  test("edges carry resolved endpoint positions for rendering", () => {
    const layout = computeLayout(nodes, edges)
    const e = layout.edges.find((edge) => edge.source === "h1" && edge.target === "p1")!
    expect(e.a.id).toBe("h1")
    expect(e.b.id).toBe("p1")
    expect(typeof e.a.x).toBe("number")
  })

  test("a column beyond the per-layer cap drops the excess, but keeps a selected node visible", () => {
    const manySubdomains: LayoutNode[] = Array.from({ length: 25 }, (_, i) => ({
      id: `s${i}`,
      type: "subdomain",
      label: `s${i}.acme.com`,
      status: "pending",
    }))
    const withoutSelection = computeLayout(manySubdomains, [])
    expect(withoutSelection.placed.some((p) => p.id === "s24")).toBe(false)

    const withSelection = computeLayout(manySubdomains, [], "s24")
    expect(withSelection.placed.some((p) => p.id === "s24")).toBe(true)
    // Still capped at 20 for that column — the selected node replaces the last slot, not appended.
    expect(withSelection.layers.find((l) => l.type === "subdomain")?.nodes).toHaveLength(20)
  })
})

describe("neighborIds / edgeTouches", () => {
  test("collects both-direction neighbors and excludes self", () => {
    expect([...neighborIds(edges, "h1")].sort()).toEqual(["p1", "s1"])
    expect(neighborIds(edges, "h1").has("h1")).toBe(false)
  })

  test("edgeTouches is true for either endpoint", () => {
    expect(edgeTouches({ source: "a", target: "b" }, "a")).toBe(true)
    expect(edgeTouches({ source: "a", target: "b" }, "b")).toBe(true)
    expect(edgeTouches({ source: "a", target: "b" }, "c")).toBe(false)
  })
})

describe("zoomView", () => {
  test("initialView frames the whole layout", () => {
    const layout = computeLayout(nodes, edges)
    expect(initialView(layout)).toEqual({ x: 0, y: 0, w: layout.width, h: layout.height })
  })

  test("zooming in shrinks the viewBox and keeps the focal point stationary", () => {
    const layout = computeLayout(nodes, edges)
    const view = initialView(layout)
    const focusX = layout.width / 2
    const focusY = layout.height / 2
    const zoomed = zoomView(view, layout, 2, focusX, focusY)
    expect(zoomed.w).toBeLessThan(view.w)
    // Focal point stays at the same relative spot (center → center).
    expect(zoomed.x + zoomed.w / 2).toBeCloseTo(focusX)
    expect(zoomed.y + zoomed.h / 2).toBeCloseTo(focusY)
  })

  test("clamps zoom-out so the surface cannot shrink indefinitely", () => {
    const layout = computeLayout(nodes, edges)
    let view = initialView(layout)
    for (let i = 0; i < 20; i++) view = zoomView(view, layout, 0.5, 0, 0)
    // MIN_ZOOM is 0.4, so the widest the box gets is width / 0.4.
    expect(view.w).toBeLessThanOrEqual(layout.width / 0.4 + 0.001)
  })
})
