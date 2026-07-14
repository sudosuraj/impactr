import type { JSX } from "solid-js"
import { Show } from "solid-js"

export function StatCard(props: {
  label: string
  value: string | number
  icon?: JSX.Element
  tone?: "neutral" | "danger" | "success"
  hint?: string
}) {
  const valueClass = () =>
    props.tone === "danger" ? "text-status-danger" : props.tone === "success" ? "text-status-success" : "text-foreground"

  return (
    <div class="rounded-lg border border-border bg-surface p-5">
      <div class="flex items-center justify-between">
        <span class="text-sm text-muted-foreground">{props.label}</span>
        <Show when={props.icon}>
          <span class="text-muted-foreground">{props.icon}</span>
        </Show>
      </div>
      <div class={`mt-2 text-2xl font-semibold tracking-tight ${valueClass()}`}>{props.value}</div>
      <Show when={props.hint}>
        <p class="mt-1 text-xs text-muted-foreground">{props.hint}</p>
      </Show>
    </div>
  )
}
