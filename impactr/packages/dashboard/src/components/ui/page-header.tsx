import type { JSX } from "solid-js"
import { Show } from "solid-js"

export function PageHeader(props: { title: string; description?: string; actions?: JSX.Element }) {
  return (
    <div class="flex items-center justify-between gap-4 border-b border-border px-8 py-5">
      <div>
        <h1 class="text-lg font-semibold text-foreground">{props.title}</h1>
        <Show when={props.description}>
          <p class="mt-0.5 text-sm text-muted-foreground">{props.description}</p>
        </Show>
      </div>
      <Show when={props.actions}>
        <div class="flex shrink-0 items-center gap-2">{props.actions}</div>
      </Show>
    </div>
  )
}
