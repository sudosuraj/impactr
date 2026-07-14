import type { JSX } from "solid-js"
import { splitProps } from "solid-js"

export function Input(props: JSX.InputHTMLAttributes<HTMLInputElement>) {
  const [local, rest] = splitProps(props, ["class"])
  return (
    <input
      {...rest}
      class={`h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-border-strong focus:ring-2 focus:ring-ring/20 ${local.class ?? ""}`}
    />
  )
}

export function SearchInput(props: JSX.InputHTMLAttributes<HTMLInputElement>) {
  const [local, rest] = splitProps(props, ["class"])
  return (
    <div class="relative">
      <svg
        class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
        width="15"
        height="15"
        viewBox="0 0 15 15"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M10.5 10.5 14 14M12 6.5a5.5 5.5 0 11-11 0 5.5 5.5 0 0111 0z"
          stroke="currentColor"
          stroke-width="1.3"
          stroke-linecap="round"
        />
      </svg>
      <input
        {...rest}
        type="search"
        class={`h-9 w-full rounded-md border border-border bg-surface pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-border-strong focus:ring-2 focus:ring-ring/20 ${local.class ?? ""}`}
      />
    </div>
  )
}
