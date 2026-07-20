/**
 * Pure geometry and selection logic for the interactive attack-graph map.
 *
 * Kept free of Solid/DOM so the layout and neighbor math is unit-testable on its own; the component
 * is a thin rendering + interaction shell over these functions. The layout is a deterministic
 * left-to-right layering by asset kind (subdomains → hosts → services → endpoints → vulns → creds),
 * which reads as a kill-chain from external surface to impact.
 */

export interface LayoutNode {
  readonly id: string
  readonly type: string
  readonly label: string
  readonly status: string
}

export interface LayoutEdge {
  readonly source: string
  readonly target: string
}

export interface PlacedNode {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly node: LayoutNode
}

export interface PlacedEdge {
  readonly source: string
  readonly target: string
  readonly a: PlacedNode
  readonly b: PlacedNode
}

export interface Layout {
  readonly layers: ReadonlyArray<{ readonly type: string; readonly nodes: ReadonlyArray<LayoutNode> }>
  readonly placed: ReadonlyArray<PlacedNode>
  readonly edges: ReadonlyArray<PlacedEdge>
  readonly width: number
  readonly height: number
}

export const LAYER_ORDER = ["subdomain", "ip", "port", "endpoint", "vulnerability", "credential"] as const

export const TYPE_LABEL: Record<string, string> = {
  subdomain: "Subdomains",
  ip: "Hosts",
  port: "Services",
  endpoint: "Endpoints",
  vulnerability: "Vulns",
  credential: "Creds",
}

export const STATUS_COLOR: Record<string, string> = {
  compromised: "var(--severity-critical)",
  exploiting: "var(--severity-high)",
  enumerating: "var(--foreground)",
  pending: "var(--muted-foreground)",
  dead_end: "var(--muted-foreground)",
}

const COL_GAP = 168
const ROW_GAP = 26
const MARGIN_X = 70
const MARGIN_Y = 34
const PER_LAYER = 20

/**
 * Deterministically place nodes into typed columns and route edges between placed endpoints.
 * `selectedId`, if given, is guaranteed a slot in its column even past the per-column cap —
 * otherwise selecting a node past the cap (or a refresh pushing it past the cap) would silently
 * drop it from the layout and clear the selection.
 */
export const computeLayout = (nodes: ReadonlyArray<LayoutNode>, edges: ReadonlyArray<LayoutEdge>, selectedId?: string): Layout => {
  const layers = LAYER_ORDER.map((type) => {
    const typeNodes = nodes.filter((n) => n.type === type)
    const capped = typeNodes.slice(0, PER_LAYER)
    if (selectedId !== undefined && !capped.some((n) => n.id === selectedId)) {
      const selectedNode = typeNodes.find((n) => n.id === selectedId)
      if (selectedNode) capped.splice(PER_LAYER - 1, 1, selectedNode)
    }
    return { type, nodes: capped }
  }).filter((l) => l.nodes.length > 0)

  const cols = layers.length
  const maxRows = Math.max(1, ...layers.map((l) => l.nodes.length))
  const width = MARGIN_X * 2 + Math.max(0, cols - 1) * COL_GAP
  const height = Math.max(200, MARGIN_Y * 2 + (maxRows - 1) * ROW_GAP)

  const byId = new Map<string, PlacedNode>()
  layers.forEach((layer, li) => {
    const x = MARGIN_X + li * COL_GAP
    const totalH = (layer.nodes.length - 1) * ROW_GAP
    const startY = (height - totalH) / 2
    layer.nodes.forEach((node, ni) => byId.set(node.id, { id: node.id, x, y: startY + ni * ROW_GAP, node }))
  })

  const placedEdges: PlacedEdge[] = []
  for (const edge of edges) {
    const a = byId.get(edge.source)
    const b = byId.get(edge.target)
    if (a && b) placedEdges.push({ source: edge.source, target: edge.target, a, b })
  }

  return { layers, placed: [...byId.values()], edges: placedEdges, width, height }
}

/** Ids directly connected to `id` by any edge (both directions). Excludes `id` itself. */
export const neighborIds = (edges: ReadonlyArray<LayoutEdge>, id: string): ReadonlySet<string> => {
  const out = new Set<string>()
  for (const edge of edges) {
    if (edge.source === id) out.add(edge.target)
    if (edge.target === id) out.add(edge.source)
  }
  out.delete(id)
  return out
}

/** Whether an edge touches `id` — used to keep incident edges lit while a node is focused. */
export const edgeTouches = (edge: LayoutEdge, id: string): boolean => edge.source === id || edge.target === id

export interface ViewBox {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

/** The initial viewBox that frames the whole layout. */
export const initialView = (layout: Layout): ViewBox => ({ x: 0, y: 0, w: layout.width, h: layout.height })

const MIN_ZOOM = 0.4
const MAX_ZOOM = 6

/**
 * Zoom the viewBox by `factor` (>1 zooms in) about a focal point given in viewBox coordinates,
 * keeping that point stationary on screen. Clamped so the surface can't be zoomed past sane bounds.
 */
export const zoomView = (view: ViewBox, base: Layout, factor: number, focusX: number, focusY: number): ViewBox => {
  const currentZoom = base.width / view.w
  const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, currentZoom * factor))
  const w = base.width / nextZoom
  const h = base.height / nextZoom
  // Preserve the focal point's relative position within the box so it stays under the cursor.
  const rx = view.w === 0 ? 0.5 : (focusX - view.x) / view.w
  const ry = view.h === 0 ? 0.5 : (focusY - view.y) / view.h
  return { x: focusX - rx * w, y: focusY - ry * h, w, h }
}
