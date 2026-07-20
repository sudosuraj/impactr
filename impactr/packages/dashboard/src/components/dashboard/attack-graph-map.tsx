import { For, Show, createMemo, createSignal, createEffect } from "solid-js"
import { EmptyState } from "~/components/ui/empty-state"
import type { MapNode, MapEdge } from "~/lib/command-center"
import {
  computeLayout,
  neighborIds,
  edgeTouches,
  initialView,
  zoomView,
  TYPE_LABEL,
  STATUS_COLOR,
  type ViewBox,
} from "~/lib/attack-graph-layout"

const STATUS_LABEL: Record<string, string> = {
  compromised: "Compromised",
  exploiting: "Exploiting",
  enumerating: "Enumerating",
  pending: "Discovered",
  dead_end: "Dead end",
}

export function AttackGraphMap(props: { nodes: MapNode[]; edges: MapEdge[] }) {
  const layout = createMemo(() => computeLayout(props.nodes, props.edges))

  const [view, setView] = createSignal<ViewBox | undefined>()
  const [selected, setSelected] = createSignal<string | undefined>()
  const [hovered, setHovered] = createSignal<string | undefined>()

  // Frame the graph once we have geometry, and keep the user's pan/zoom across live refreshes.
  // Only re-fit when there is no view yet, so incoming data never yanks the camera mid-inspection.
  createEffect(() => {
    const l = layout()
    if (view() === undefined && l.placed.length > 0) setView(initialView(l))
  })

  // Drop a stale selection if the selected node fell out of the refreshed graph.
  createEffect(() => {
    const id = selected()
    if (id !== undefined && !layout().placed.some((p) => p.id === id)) setSelected(undefined)
  })

  let svgEl: SVGSVGElement | undefined
  let pan: { clientX: number; clientY: number; view: ViewBox } | undefined
  let dragged = false
  const [panning, setPanning] = createSignal(false)

  const toViewCoords = (clientX: number, clientY: number) => {
    const v = view()
    if (!svgEl || !v) return { x: 0, y: 0 }
    const rect = svgEl.getBoundingClientRect()
    return {
      x: v.x + ((clientX - rect.left) / rect.width) * v.w,
      y: v.y + ((clientY - rect.top) / rect.height) * v.h,
    }
  }

  const onWheel = (e: WheelEvent) => {
    const v = view()
    if (!v) return
    e.preventDefault()
    const focus = toViewCoords(e.clientX, e.clientY)
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
    setView(zoomView(v, layout(), factor, focus.x, focus.y))
  }

  const onPointerDown = (e: PointerEvent) => {
    const v = view()
    if (!v) return
    pan = { clientX: e.clientX, clientY: e.clientY, view: v }
    dragged = false
    ;(e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: PointerEvent) => {
    if (!pan || !svgEl) return
    const rect = svgEl.getBoundingClientRect()
    if (Math.abs(e.clientX - pan.clientX) + Math.abs(e.clientY - pan.clientY) > 3) {
      dragged = true
      setPanning(true)
    }
    const dx = ((e.clientX - pan.clientX) / rect.width) * pan.view.w
    const dy = ((e.clientY - pan.clientY) / rect.height) * pan.view.h
    setView({ ...pan.view, x: pan.view.x - dx, y: pan.view.y - dy })
  }

  const endPan = (e: PointerEvent) => {
    if (pan) (e.currentTarget as SVGSVGElement).releasePointerCapture?.(e.pointerId)
    pan = undefined
    setPanning(false)
  }

  // Clear the selection on a genuine background click, but not when a pan drag ends over the canvas.
  const onBackgroundClick = () => {
    if (dragged) {
      dragged = false
      return
    }
    setSelected(undefined)
  }

  const active = () => selected() ?? hovered()
  const litSet = createMemo(() => {
    const id = active()
    if (id === undefined) return undefined
    const set = new Set(neighborIds(props.edges, id))
    set.add(id)
    return set
  })

  const selectedNode = createMemo(() => {
    const id = selected()
    return id === undefined ? undefined : layout().placed.find((p) => p.id === id)?.node
  })
  const connectedLabels = createMemo(() => {
    const id = selected()
    if (id === undefined) return []
    const neighbors = neighborIds(props.edges, id)
    return layout()
      .placed.filter((p) => neighbors.has(p.id))
      .map((p) => p.node.label)
  })

  const nodeOpacity = (id: string) => {
    const lit = litSet()
    return lit === undefined || lit.has(id) ? 1 : 0.22
  }

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
        <div class="mb-2 flex items-center justify-between gap-3">
          <p class="text-xs text-muted">Scroll to zoom · drag to pan · click a node to trace its links</p>
          <button
            type="button"
            class="rounded-md border border-border px-2.5 py-1 text-xs text-muted hover:text-foreground"
            onClick={() => {
              setView(initialView(layout()))
              setSelected(undefined)
            }}
          >
            Fit
          </button>
        </div>

        <div class="relative overflow-hidden rounded-md border border-border">
          <svg
            ref={svgEl}
            viewBox={view() ? `${view()!.x} ${view()!.y} ${view()!.w} ${view()!.h}` : `0 0 ${layout().width} ${layout().height}`}
            width="100%"
            style={{ "max-height": "460px", height: "auto", "touch-action": "none", cursor: panning() ? "grabbing" : "grab" }}
            role="img"
            aria-label="Interactive attack graph — assets and their relationships, colored by exploitation status. Scroll to zoom, drag to pan, click a node to trace its links."
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endPan}
            onPointerCancel={endPan}
            onClick={onBackgroundClick}
          >
            <For each={layout().layers}>
              {(layer, li) => (
                <text
                  x={70 + li() * 168}
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

            <For each={layout().edges}>
              {(edge) => {
                const focused = () => active() !== undefined && edgeTouches(edge, active()!)
                const dim = () => active() !== undefined && !focused()
                const hot = () => edge.b.node.status === "compromised" || edge.b.node.status === "exploiting"
                return (
                  <path
                    d={`M${edge.a.x},${edge.a.y} C${(edge.a.x + edge.b.x) / 2},${edge.a.y} ${(edge.a.x + edge.b.x) / 2},${edge.b.y} ${edge.b.x},${edge.b.y}`}
                    fill="none"
                    stroke={focused() ? "var(--brand)" : hot() ? "var(--severity-high)" : "var(--border-strong)"}
                    stroke-width={focused() ? 1.8 : hot() ? 1.4 : 1}
                    stroke-opacity={dim() ? 0.12 : focused() ? 0.9 : hot() ? 0.7 : 0.5}
                  />
                )
              }}
            </For>

            <For each={layout().placed}>
              {(p) => {
                const color = STATUS_COLOR[p.node.status] ?? "var(--muted-foreground)"
                const isSelected = () => selected() === p.id
                const ring = () => isSelected() || p.node.status === "compromised"
                return (
                  <g
                    style={{ opacity: nodeOpacity(p.id), cursor: "pointer" }}
                    onPointerEnter={() => setHovered(p.id)}
                    onPointerLeave={() => setHovered((h) => (h === p.id ? undefined : h))}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelected((s) => (s === p.id ? undefined : p.id))
                    }}
                  >
                    <title>{`${p.node.label} · ${STATUS_LABEL[p.node.status] ?? p.node.status}`}</title>
                    <Show when={ring()}>
                      <circle cx={p.x} cy={p.y} r="8.5" fill="none" stroke={isSelected() ? "var(--brand)" : color} stroke-opacity="0.5" />
                    </Show>
                    <circle cx={p.x} cy={p.y} r={isSelected() ? 6 : 5} fill={color} stroke="var(--surface)" stroke-width="1.5" />
                  </g>
                )
              }}
            </For>
          </svg>

          <Show when={selectedNode()}>
            {(n) => (
              <div class="absolute right-3 top-3 max-w-[230px] rounded-lg border border-border bg-surface/95 p-3 text-xs shadow-lg backdrop-blur">
                <p class="truncate font-semibold text-foreground" title={n().label}>
                  {n().label}
                </p>
                <p class="mt-0.5 text-muted">
                  {TYPE_LABEL[n().type] ?? n().type} · {STATUS_LABEL[n().status] ?? n().status}
                </p>
                <p class="mt-2 text-muted">
                  {connectedLabels().length === 0
                    ? "No linked assets yet."
                    : `Linked to ${connectedLabels().length} asset${connectedLabels().length === 1 ? "" : "s"}:`}
                </p>
                <Show when={connectedLabels().length > 0}>
                  <ul class="mt-1 space-y-0.5">
                    <For each={connectedLabels().slice(0, 6)}>
                      {(label) => <li class="truncate text-foreground">{label}</li>}
                    </For>
                  </ul>
                </Show>
              </div>
            )}
          </Show>
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
