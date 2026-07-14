import type { JSX } from "solid-js"
import { Show } from "solid-js"

export function EmptyState(props: { icon?: JSX.Element; title: string; description?: string; action?: JSX.Element }) {
  return (
    <div class="flex flex-col items-center justify-center px-6 py-12 text-center">
      <Show when={props.icon}>
        <div class="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-border text-muted-foreground">
          {props.icon}
        </div>
      </Show>
      <h3 class="text-sm font-medium text-foreground">{props.title}</h3>
      <Show when={props.description}>
        <p class="mt-1 max-w-sm text-sm text-muted-foreground">{props.description}</p>
      </Show>
      <Show when={props.action}>
        <div class="mt-4">{props.action}</div>
      </Show>
    </div>
  )
}
