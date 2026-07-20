/**
 * Pure layout, navigation, and rendering logic for the interactive terminal attack-graph viewer
 * (`impactr graph`). Kept free of IO, ANSI, and the terminal so it is unit-testable; the command
 * wraps these with a raw-mode input loop and a live re-read of the graph.
 *
 * The graph is laid out as typed columns in kill-chain order (subdomains → hosts → services →
 * endpoints → vulns → creds), the same mental model as the web dashboard's map, adapted to a
 * character grid with a movable cursor.
 */

export interface ViewNode {
  readonly id: string
  readonly type: string
  readonly label: string
  readonly status: string
}

export interface ViewEdge {
  readonly source: string
  readonly target: string
}

export interface Column {
  readonly type: string
  readonly label: string
  readonly nodes: ReadonlyArray<ViewNode>
}

export const LAYER_ORDER = ["subdomain", "ip", "port", "endpoint", "vulnerability", "credential"] as const

export const TYPE_LABEL: Record<string, string> = {
  subdomain: "SUBDOMAINS",
  ip: "HOSTS",
  port: "SERVICES",
  endpoint: "ENDPOINTS",
  vulnerability: "VULNS",
  credential: "CREDS",
}

/** A single glyph marking a node's exploitation status, legible without color. */
export const STATUS_GLYPH: Record<string, string> = {
  compromised: "◉",
  exploiting: "◍",
  enumerating: "◌",
  pending: "·",
  dead_end: "✕",
}

const PER_COLUMN = 24

/** Group nodes into typed columns in kill-chain order, dropping empty layers and capping height. */
export const buildColumns = (nodes: ReadonlyArray<ViewNode>, perColumn = PER_COLUMN): ReadonlyArray<Column> =>
  LAYER_ORDER.map((type) => ({
    type,
    label: TYPE_LABEL[type] ?? type.toUpperCase(),
    nodes: nodes.filter((n) => n.type === type).slice(0, perColumn),
  })).filter((c) => c.nodes.length > 0)

/** Ids directly connected to `id` in either direction, excluding `id`. */
export const neighborIds = (edges: ReadonlyArray<ViewEdge>, id: string): ReadonlySet<string> => {
  const out = new Set<string>()
  for (const edge of edges) {
    if (edge.source === id) out.add(edge.target)
    if (edge.target === id) out.add(edge.source)
  }
  out.delete(id)
  return out
}

/** The (column, row) of a node id, or undefined if it is not currently placed. */
export const locate = (columns: ReadonlyArray<Column>, id: string): { col: number; row: number } | undefined => {
  for (let col = 0; col < columns.length; col++) {
    const row = columns[col].nodes.findIndex((n) => n.id === id)
    if (row >= 0) return { col, row }
  }
  return undefined
}

/** The node id at a grid position, or undefined when out of bounds. */
export const nodeAt = (columns: ReadonlyArray<Column>, col: number, row: number): string | undefined =>
  columns[col]?.nodes[row]?.id

export type Direction = "left" | "right" | "up" | "down"

/**
 * Move the cursor from `id` in a direction, clamping at edges. Left/right change column and keep the
 * row within the destination column's bounds; up/down move within a column. Returns the new id (or
 * the first node when `id` is unknown, so a refreshed graph that dropped the selection still lands
 * somewhere sensible).
 */
export const navigate = (columns: ReadonlyArray<Column>, id: string | undefined, dir: Direction): string | undefined => {
  if (columns.length === 0) return undefined
  const at = id === undefined ? undefined : locate(columns, id)
  if (!at) return columns[0].nodes[0]?.id
  const clampRow = (col: number, row: number) => Math.min(row, columns[col].nodes.length - 1)
  if (dir === "up") return nodeAt(columns, at.col, Math.max(0, at.row - 1))
  if (dir === "down") return nodeAt(columns, at.col, Math.min(columns[at.col].nodes.length - 1, at.row + 1))
  if (dir === "left") {
    const col = Math.max(0, at.col - 1)
    return nodeAt(columns, col, clampRow(col, at.row))
  }
  const col = Math.min(columns.length - 1, at.col + 1)
  return nodeAt(columns, col, clampRow(col, at.row))
}

export interface SelectionSummary {
  readonly node: ViewNode
  readonly neighborCount: number
  readonly neighborLabels: ReadonlyArray<string>
}

/** Details of the selected node for the viewer's footer: its status and what it links to. */
export const describeSelection = (
  columns: ReadonlyArray<Column>,
  edges: ReadonlyArray<ViewEdge>,
  id: string | undefined,
): SelectionSummary | undefined => {
  if (id === undefined) return undefined
  const all = columns.flatMap((c) => c.nodes)
  const node = all.find((n) => n.id === id)
  if (!node) return undefined
  const neighbors = neighborIds(edges, id)
  const byId = new Map(all.map((n) => [n.id, n]))
  const neighborLabels = [...neighbors].map((nid) => byId.get(nid)?.label ?? nid)
  return { node, neighborCount: neighbors.size, neighborLabels }
}

export interface Cell {
  readonly id: string
  readonly text: string
  /** "selected" — the cursor; "neighbor" — linked to the cursor; "normal" otherwise. */
  readonly emphasis: "selected" | "neighbor" | "normal"
}

const truncate = (text: string, width: number) => (text.length <= width ? text : `${text.slice(0, Math.max(1, width - 1))}…`)

/**
 * Build the per-column cell matrix the renderer paints. Emphasis marks the selected node and its
 * neighbors so the command layer can color or bracket them; kept here (not in the command) so the
 * highlight logic is unit-testable.
 */
export const buildCells = (
  columns: ReadonlyArray<Column>,
  edges: ReadonlyArray<ViewEdge>,
  selectedId: string | undefined,
  cellWidth = 18,
): ReadonlyArray<ReadonlyArray<Cell>> => {
  const lit = selectedId === undefined ? undefined : neighborIds(edges, selectedId)
  return columns.map((column) =>
    column.nodes.map((node) => {
      const glyph = STATUS_GLYPH[node.status] ?? STATUS_GLYPH.pending
      const emphasis: Cell["emphasis"] =
        node.id === selectedId ? "selected" : lit?.has(node.id) ? "neighbor" : "normal"
      return { id: node.id, text: `${glyph} ${truncate(node.label, cellWidth)}`, emphasis }
    }),
  )
}
