import { For, Show, createMemo } from "solid-js"
import { EmptyState } from "~/components/ui/empty-state"
import type { MapNode, MapEdge } from "~/lib/command-center"

const ORDER = ["subdomain", "ip", "port", "endpoint", "vulnerability", "credential"]
const TYPE_LABEL: Record<string, string> = {
  subdomain: "Subdomains",
  ip: "Hosts",
  port: "Services",
  endpoint: "Endpoints",
  vulnerability: "Vulns",
  credential: "Creds",
}
const STATUS_COLOR: Record<string, string> = {
  compromised: "var(--severity-critical)",
  exploiting: "var(--severity-high)",
  enumerating: "var(--foreground)",
  pending: "var(--muted-foreground)",
  dead_end: "var(--muted-foreground)",
}

const COLG = 168
const ROWG = 26
const MX = 70
const MY = 34
const PER_LAYER = 20

export function AttackGraphMap(props: { nodes: MapNode[]; edges: MapEdge[] }) {
  const model = createMemo(() => {
    const layers = ORDER.map((type) => ({
      type,
      nodes: props.nodes.filter((n) => n.type === type).slice(0, PER_LAYER),
    })).filter((l) => l.nodes.length > 0)

    const cols = layers.length
    const maxRows = Math.max(1, ...layers.map((l) => l.nodes.length))
    const W = MX * 2 + Math.max(0, cols - 1) * COLG
    const H = Math.max(200, MY * 2 + (maxRows - 1) * ROWG)

    const pos = new Map<string, { x: number; y: number; node: MapNode }>()
    layers.forEach((layer, li) => {
      const x = MX + li * COLG
      const totalH = (layer.nodes.length - 1) * ROWG
      const startY = (H - totalH) / 2
      layer.nodes.forEach((node, ni) => pos.set(node.id, { x, y: startY + ni * ROWG, node }))
    })

    const edges = props.edges.filter((e) => pos.has(e.source) && pos.has(e.target))
    return { layers, pos, edges, W, H }
  })

  return (
    <Show
      when={props.nodes.length > 0}
      fallback={
        <div class="p-5">
          <EmptyState
            title="Attack graph is empty"
            description="Nodes and the relationships between them appear here as the agent maps the surface."
          />
        </div>
      }
    >
      <div class="p-4">
        <div class="overflow-x-auto">
          <svg
            viewBox={`0 0 ${model().W} ${model().H}`}
            width="100%"
            style={{ "max-height": "440px", height: "auto" }}
            role="img"
            aria-label="Attack graph — assets and the relationships between them, colored by exploitation status"
          >
            <For each={model().layers}>
              {(layer, li) => (
                <text
                  x={MX + li() * COLG}
                  y="16"
                  text-anchor="middle"
                  font-size="10"
                  fill="var(--muted)"
                  style={{ "letter-spacing": "0.08em", "text-transform": "uppercase" }}
                >
                  {TYPE_LABEL[layer.type] ?? layer.type}
                </text>
              )}
            </For>

            <For each={model().edges}>
              {(edge) => {
                const a = model().pos.get(edge.source)!
                const b = model().pos.get(edge.target)!
                const hot = b.node.status === "compromised" || b.node.status === "exploiting"
                return (
                  <path
                    d={`M${a.x},${a.y} C${(a.x + b.x) / 2},${a.y} ${(a.x + b.x) / 2},${b.y} ${b.x},${b.y}`}
                    fill="none"
                    stroke={hot ? "var(--severity-high)" : "var(--border-strong)"}
                    stroke-width={hot ? 1.4 : 1}
                    stroke-opacity={hot ? 0.7 : 0.5}
                  />
                )
              }}
            </For>

            <For each={[...model().pos.values()]}>
              {(p) => {
                const color = STATUS_COLOR[p.node.status] ?? "var(--muted-foreground)"
                const hot = p.node.status === "compromised"
                return (
                  <g>
                    <title>{`${p.node.label} · ${p.node.status}`}</title>
                    <Show when={hot}>
                      <circle cx={p.x} cy={p.y} r="8.5" fill="none" stroke={color} stroke-opacity="0.4" />
                    </Show>
                    <circle cx={p.x} cy={p.y} r="5" fill={color} stroke="var(--surface)" stroke-width="1.5" />
                  </g>
                )
              }}
            </For>
          </svg>
        </div>

        <div class="mt-3 flex flex-wrap gap-4 border-t border-border pt-3">
          <Dot color="var(--muted-foreground)" label="Discovered" />
          <Dot color="var(--foreground)" label="Enumerating" />
          <Dot color="var(--severity-high)" label="Exploiting" />
          <Dot color="var(--severity-critical)" label="Compromised" />
        </div>
      </div>
    </Show>
  )
}

function Dot(props: { color: string; label: string }) {
  return (
    <span class="flex items-center gap-2 text-xs text-muted">
      <span class="h-2.5 w-2.5 rounded-full" style={{ "background-color": props.color }} />
      {props.label}
    </span>
  )
}
