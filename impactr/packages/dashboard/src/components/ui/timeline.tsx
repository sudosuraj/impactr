import type { JSX } from "solid-js"
import { For } from "solid-js"

export interface TimelineItem {
  readonly id: string
  readonly title: JSX.Element
  readonly description?: string
  readonly time: string
  readonly tone?: "neutral" | "danger" | "success" | "active"
}

const toneDot: Record<NonNullable<TimelineItem["tone"]>, string> = {
  neutral: "bg-muted-foreground",
  danger: "bg-status-danger",
  success: "bg-status-success",
  active: "bg-status-active",
}

export function Timeline(props: { items: ReadonlyArray<TimelineItem> }) {
  return (
    <ol class="relative space-y-0">
      <For each={props.items}>
        {(item, index) => (
          <li class="relative flex gap-3 pb-5 last:pb-0">
            {index() < props.items.length - 1 && (
              <span class="absolute left-[5px] top-3 h-full w-px bg-border" aria-hidden="true" />
            )}
            <span class={`relative z-10 mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2 border-surface ${toneDot[item.tone ?? "neutral"]}`} />
            <div class="min-w-0 flex-1">
              <div class="flex items-baseline justify-between gap-3">
                <div class="text-sm text-foreground">{item.title}</div>
                <time class="shrink-0 text-xs text-muted-foreground">{item.time}</time>
              </div>
              {item.description && <p class="mt-0.5 text-sm text-muted-foreground">{item.description}</p>}
            </div>
          </li>
        )}
      </For>
    </ol>
  )
}
