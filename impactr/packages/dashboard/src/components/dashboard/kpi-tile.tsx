import { Show } from "solid-js"

export function KpiTile(props: {
  label: string
  value: string | number
  sub?: string
  delta?: string
  tone?: "neutral" | "critical"
}) {
  return (
    <div class="rounded-xl border border-border bg-surface p-[17px] shadow-sm">
      <div class="flex items-center justify-between gap-2">
        <span class="text-[11px] font-medium uppercase tracking-wide text-muted">{props.label}</span>
        <Show when={props.delta}>
          <span class="rounded-md bg-brand/10 px-1.5 py-0.5 text-[11px] font-semibold text-brand tnum">{props.delta}</span>
        </Show>
      </div>
      <div
        class={`mt-3 text-3xl font-semibold tracking-tight tnum ${
          props.tone === "critical" ? "text-severity-critical" : "text-foreground"
        }`}
      >
        {props.value}
      </div>
      <Show when={props.sub}>
        <p class="mt-2 text-xs text-muted">{props.sub}</p>
      </Show>
    </div>
  )
}
