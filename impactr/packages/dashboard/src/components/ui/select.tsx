import type { JSX } from "solid-js"
import { For, splitProps } from "solid-js"

export function Select(
  props: JSX.SelectHTMLAttributes<HTMLSelectElement> & {
    options: ReadonlyArray<{ value: string; label: string }>
  },
) {
  const [local, rest] = splitProps(props, ["class", "options"])
  return (
    <div class="relative">
      <select
        {...rest}
        class={`h-9 w-full appearance-none rounded-md border border-border bg-surface pl-3 pr-8 text-sm text-foreground outline-none transition-colors focus:border-border-strong focus:ring-2 focus:ring-ring/20 ${local.class ?? ""}`}
      >
        <For each={local.options}>{(option) => <option value={option.value}>{option.label}</option>}</For>
      </select>
      <svg
        class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        aria-hidden="true"
      >
        <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </div>
  )
}
