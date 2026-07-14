import { For, Show } from "solid-js"
import { EmptyState } from "~/components/ui/empty-state"

type Depth = "discovered" | "enumerated" | "vulnerable" | "exploited"

export interface TerrainRow {
  readonly label: string
  readonly total: number
  readonly cells: Depth[]
}

const CELL: Record<Depth, string> = {
  discovered: "border border-border-strong bg-transparent",
  enumerated: "bg-muted-foreground/50",
  vulnerable: "bg-foreground",
  exploited: "bg-severity-critical",
}

export function SurfaceTerrain(props: { terrain: TerrainRow[] }) {
  return (
    <Show
      when={props.terrain.length > 0}
      fallback={
        <div class="p-5">
          <EmptyState title="No surface mapped yet" description="Assets appear here as the agent enumerates the scope." />
        </div>
      }
    >
      <div class="p-5">
        <div class="grid gap-x-8 gap-y-6 md:grid-cols-2">
          <For each={props.terrain}>
            {(row) => (
              <div>
                <div class="mb-2.5 flex items-baseline justify-between">
                  <span class="text-[13px] font-semibold text-foreground">{row.label}</span>
                  <span class="text-xs text-muted tnum">{row.total}</span>
                </div>
                <div class="flex flex-wrap gap-[3px]">
                  <For each={row.cells}>{(depth) => <span class={`h-3 w-3 rounded-[3px] ${CELL[depth]}`} />}</For>
                  <Show when={row.total > row.cells.length}>
                    <span class="ml-1 self-center text-[11px] text-muted tnum">+{row.total - row.cells.length}</span>
                  </Show>
                </div>
              </div>
            )}
          </For>
        </div>
        <div class="mt-5 flex flex-wrap gap-4 border-t border-border pt-4">
          <Legend cls="border border-border-strong" label="Discovered" />
          <Legend cls="bg-muted-foreground/50" label="Enumerated" />
          <Legend cls="bg-foreground" label="Vulnerable" />
          <Legend cls="bg-severity-critical" label="Exploited" />
        </div>
      </div>
    </Show>
  )
}

function Legend(props: { cls: string; label: string }) {
  return (
    <span class="flex items-center gap-2 text-xs text-muted">
      <span class={`h-3 w-3 rounded-[3px] ${props.cls}`} />
      {props.label}
    </span>
  )
}
