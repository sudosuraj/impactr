import { Effect } from "effect"
import * as AttackGraph from "@impactr-ai/core/attack-graph/graph"
import { effectCmd, fail } from "../effect-cmd"
import { Session } from "@/session/session"
import {
  buildCells,
  buildColumns,
  describeSelection,
  navigate,
  type Direction,
  type ViewEdge,
  type ViewNode,
} from "./graph-view"

const RESET = "\x1b[0m"
const DIM = "\x1b[2m"
const REVERSE = "\x1b[7m"
const CYAN = "\x1b[36m"
const BOLD = "\x1b[1m"
const CELL_WIDTH = 22

const STATUS_COLOR: Record<string, string> = {
  compromised: "\x1b[31m", // red
  exploiting: "\x1b[33m", // yellow
  enumerating: "\x1b[37m", // white
  pending: "\x1b[90m", // grey
  dead_end: "\x1b[90m",
}

const pad = (text: string, width: number) => {
  // ANSI-agnostic pad on the visible glyph count (labels here carry no escapes yet).
  const visible = [...text]
  if (visible.length >= width) return visible.slice(0, width).join("")
  return text + " ".repeat(width - visible.length)
}

export const toView = (graph: AttackGraph.GraphState): { nodes: ViewNode[]; edges: ViewEdge[] } => ({
  nodes: Object.values(graph.nodes).map((n) => ({ id: n.id, type: n.type, label: n.label, status: n.status })),
  edges: graph.edges.map((e) => ({ source: e.source, target: e.target })),
})

/** Compose the full-screen frame for the current graph + selection into an ANSI string. */
export const renderFrame = (nodes: ViewNode[], edges: ViewEdge[], selectedId: string | undefined, intervalMs: number, title: string): string => {
  const columns = buildColumns(nodes)
  const out: string[] = []
  out.push(`\x1b[2J\x1b[H${BOLD}Attack graph${RESET} ${DIM}· ${title}${RESET}`)
  out.push("")

  if (columns.length === 0) {
    out.push(`${DIM}The attack graph is empty. Nodes appear here as the agent maps the surface.${RESET}`)
    out.push(`${DIM}View another session with: impactr graph <sessionID>  (see: impactr session list)${RESET}`)
    out.push("")
    out.push(`${DIM}q quit · refreshing every ${(intervalMs / 1000).toFixed(1)}s${RESET}`)
    return out.join("\r\n")
  }

  const headers = columns.map((c) => `${DIM}${pad(c.label, CELL_WIDTH)}${RESET}`).join(" ")
  out.push(headers)

  const cells = buildCells(columns, edges, selectedId, CELL_WIDTH - 3)
  const maxRows = Math.max(...columns.map((c) => c.nodes.length))
  for (let row = 0; row < maxRows; row++) {
    const line = columns
      .map((column, col) => {
        const cell = cells[col][row]
        if (!cell) return pad("", CELL_WIDTH)
        const node = column.nodes[row]
        const body = pad(cell.text, CELL_WIDTH)
        if (cell.emphasis === "selected") return `${REVERSE}${body}${RESET}`
        if (cell.emphasis === "neighbor") return `${CYAN}${body}${RESET}`
        return `${STATUS_COLOR[node.status] ?? DIM}${body}${RESET}`
      })
      .join(" ")
    out.push(line)
  }

  out.push("")
  const summary = describeSelection(columns, edges, selectedId)
  if (summary) {
    const links =
      summary.neighborCount === 0
        ? "no linked assets"
        : `links: ${summary.neighborLabels.slice(0, 5).join(", ")}${summary.neighborCount > 5 ? ", …" : ""}`
    out.push(`${BOLD}${summary.node.label}${RESET} ${DIM}[${summary.node.status}]${RESET} · ${links}`)
  } else {
    out.push(`${DIM}Select a node to trace its links.${RESET}`)
  }
  out.push(
    `${DIM}↑↓←→/hjkl move · q quit · live every ${(intervalMs / 1000).toFixed(1)}s · ${nodes.length} assets${RESET}`,
  )
  return out.join("\r\n")
}

const DIRECTIONS: Record<string, Direction> = {
  "\x1b[A": "up",
  "\x1b[B": "down",
  "\x1b[C": "right",
  "\x1b[D": "left",
  k: "up",
  j: "down",
  l: "right",
  h: "left",
}

/**
 * Run the interactive, live-refreshing terminal viewer until the user quits. Reads the graph on an
 * interval so it tracks the engine, redraws on every keypress, and always restores the terminal on
 * exit. Pure layout/navigation lives in `graph-view`; this shell is only IO.
 */
const runViewer = (
  readGraph: () => Promise<AttackGraph.GraphState>,
  opts: { intervalMs: number; title: string },
): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    const stdin = process.stdin
    const stdout = process.stdout
    let nodes: ViewNode[] = []
    let edges: ViewEdge[] = []
    let selectedId: string | undefined
    let stopped = false

    const draw = () => stdout.write(renderFrame(nodes, edges, selectedId, opts.intervalMs, opts.title))

    const refresh = async () => {
      try {
        const view = toView(await readGraph())
        nodes = view.nodes
        edges = view.edges
        // Keep the selection if the node still exists; otherwise land on the first node.
        const columns = buildColumns(nodes)
        if (selectedId === undefined || !columns.some((c) => c.nodes.some((n) => n.id === selectedId)))
          selectedId = columns[0]?.nodes[0]?.id
        if (!stopped) draw()
      } catch {
        // Transient read failures shouldn't tear down the viewer; the next tick retries.
      }
    }

    const cleanup = () => {
      if (stopped) return
      stopped = true
      clearInterval(timer)
      stdin.removeListener("data", onKey)
      if (stdin.isTTY) stdin.setRawMode(false)
      stdin.pause()
      stdout.write(`${RESET}\x1b[?25h\x1b[?1049l`) // show cursor, leave alt screen
    }

    const onKey = (data: string) => {
      if (data === "q" || data === "\x03" || data === "\x1b") {
        cleanup()
        resolve()
        return
      }
      const dir = DIRECTIONS[data]
      if (dir) {
        const next = navigate(buildColumns(nodes), selectedId, dir)
        if (next !== undefined) selectedId = next
        draw()
      }
    }

    try {
      stdout.write("\x1b[?1049h\x1b[?25l") // enter alt screen, hide cursor
      if (stdin.isTTY) stdin.setRawMode(true)
      stdin.resume()
      stdin.setEncoding("utf8")
      stdin.on("data", onKey)
      draw()
      void refresh()
    } catch (error) {
      cleanup()
      reject(error instanceof Error ? error : new Error(String(error)))
      return
    }

    const timer = setInterval(() => void refresh(), opts.intervalMs)
  })

export const GraphCommand = effectCmd({
  command: "graph [sessionID]",
  describe: "live, interactive view of a session's attack graph",
  builder: (yargs) =>
    yargs
      .positional("sessionID", {
        describe: "session to view (defaults to the most recent)",
        type: "string",
      })
      .option("interval", {
        describe: "live refresh interval in milliseconds",
        type: "number",
        default: 1500,
      }),
  handler: Effect.fn("Cli.graph")(function* (args) {
    const graph = yield* AttackGraph.AttackGraph
    const hasNodes = (id: string) =>
      graph.getGraph(id).pipe(Effect.map((g) => Object.keys(g.nodes).length > 0))

    let sessionID = args.sessionID
    let title = sessionID ?? ""
    if (!sessionID) {
      // Default to the most recent session that actually mapped a surface — not simply the newest
      // session, which is often a fresh chat with an empty graph. That mismatch reads as "no graph".
      const recent = yield* Session.Service.use((svc) => svc.list({ roots: true, limit: 40 }))
      if (recent.length === 0) return yield* fail("No sessions found. Start an engagement first.")
      let chosen = recent[0]
      for (const candidate of recent) {
        if (yield* hasNodes(candidate.id)) {
          chosen = candidate
          break
        }
      }
      sessionID = chosen.id
      title = chosen.title
    } else {
      const found = yield* Session.Service.use((svc) => svc.list({ roots: true })).pipe(
        Effect.map((all) => all.find((s) => s.id === sessionID)),
      )
      title = found?.title ?? sessionID
    }

    if (!process.stdin.isTTY || !process.stdout.isTTY)
      return yield* fail("`impactr graph` needs an interactive terminal (TTY).")

    const resolved = sessionID
    const interval = Math.max(250, args.interval)
    yield* Effect.promise(() =>
      runViewer(() => Effect.runPromise(graph.getGraph(resolved)), { intervalMs: interval, title }),
    )
  }),
})
