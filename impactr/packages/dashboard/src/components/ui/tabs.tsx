import { For } from "solid-js"

export function Tabs(props: {
  tabs: ReadonlyArray<{ value: string; label: string; count?: number }>
  active: string
  onChange: (value: string) => void
}) {
  return (
    <div class="flex items-center gap-1 border-b border-border">
      <For each={props.tabs}>
        {(tab) => (
          <button
            type="button"
            onClick={() => props.onChange(tab.value)}
            class={`relative flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors ${
              tab.value === props.active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span class="rounded-full bg-surface-raised px-1.5 py-0.5 text-xs text-muted-foreground">{tab.count}</span>
            )}
            {tab.value === props.active && <span class="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-foreground" />}
          </button>
        )}
      </For>
    </div>
  )
}
