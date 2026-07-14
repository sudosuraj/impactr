import type { JSX } from "solid-js"
import { Show } from "solid-js"

/**
 * Shared page frame: the same centered container, rhythm, and header treatment
 * as the Overview command center, so every route reads as one product.
 */
export function Page(props: {
  title: string
  description?: string
  actions?: JSX.Element
  children: JSX.Element
}) {
  return (
    <div class="mx-auto max-w-[1200px] px-6 py-7">
      <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="text-xl font-semibold tracking-tight text-foreground">{props.title}</h1>
          <Show when={props.description}>
            <p class="mt-1 text-sm text-muted">{props.description}</p>
          </Show>
        </div>
        <Show when={props.actions}>
          <div class="flex shrink-0 items-center gap-2">{props.actions}</div>
        </Show>
      </div>
      {props.children}
    </div>
  )
}

/** Small neutral count pill for page headers (e.g. "142 findings"). */
export function CountPill(props: { children: JSX.Element }) {
  return (
    <span class="rounded-full border border-border bg-surface px-3 py-1.5 text-[12.5px] text-muted tnum">
      {props.children}
    </span>
  )
}
