import type { JSX } from "solid-js"

export function Card(props: { children: JSX.Element; class?: string }) {
  return (
    <div class={`rounded-lg border border-border bg-surface ${props.class ?? ""}`}>{props.children}</div>
  )
}

export function CardHeader(props: { title: string; description?: string; action?: JSX.Element }) {
  return (
    <div class="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
      <div>
        <h2 class="text-sm font-semibold text-foreground">{props.title}</h2>
        {props.description && <p class="mt-0.5 text-sm text-muted-foreground">{props.description}</p>}
      </div>
      {props.action}
    </div>
  )
}
