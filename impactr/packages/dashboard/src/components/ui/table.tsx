import type { JSX } from "solid-js"
import { For, Show } from "solid-js"

export interface Column<T> {
  readonly header: string
  readonly cell: (row: T) => JSX.Element
  readonly class?: string
}

export function Table<T>(props: {
  columns: ReadonlyArray<Column<T>>
  rows: ReadonlyArray<T>
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  empty?: JSX.Element
}) {
  return (
    <div class="overflow-x-auto">
      <table class="w-full text-left text-sm">
        <thead>
          <tr class="border-b border-border">
            <For each={props.columns}>
              {(column) => (
                <th class={`whitespace-nowrap px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground ${column.class ?? ""}`}>
                  {column.header}
                </th>
              )}
            </For>
          </tr>
        </thead>
        <tbody>
          <Show
            when={props.rows.length > 0}
            fallback={
              <tr>
                <td colSpan={props.columns.length} class="px-5 py-12">
                  {props.empty}
                </td>
              </tr>
            }
          >
            <For each={props.rows}>
              {(row) => (
                <tr
                  class={`border-b border-border last:border-0 ${props.onRowClick ? "cursor-pointer outline-none hover:bg-surface-raised focus-visible:bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset" : ""}`}
                  tabIndex={props.onRowClick ? 0 : undefined}
                  role={props.onRowClick ? "button" : undefined}
                  onClick={() => props.onRowClick?.(row)}
                  onKeyDown={(event) => {
                    if (!props.onRowClick) return
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      props.onRowClick(row)
                    }
                  }}
                >
                  <For each={props.columns}>
                    {(column) => <td class={`whitespace-nowrap px-5 py-3.5 text-foreground ${column.class ?? ""}`}>{column.cell(row)}</td>}
                  </For>
                </tr>
              )}
            </For>
          </Show>
        </tbody>
      </table>
    </div>
  )
}
