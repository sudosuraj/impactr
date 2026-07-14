import type { JSX } from "solid-js"
import { splitProps } from "solid-js"

type Variant = "primary" | "secondary" | "ghost" | "danger"
type Size = "sm" | "md"

const variantClass: Record<Variant, string> = {
  primary: "bg-accent text-accent-foreground hover:opacity-90",
  secondary: "bg-surface border border-border text-foreground hover:bg-surface-raised",
  ghost: "text-muted-foreground hover:bg-surface-raised hover:text-foreground",
  danger: "bg-severity-critical text-white hover:opacity-90",
}

const sizeClass: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-9 px-4 text-sm",
}

export function Button(
  props: JSX.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size },
) {
  const [local, rest] = splitProps(props, ["variant", "size", "class", "children"])
  return (
    <button
      {...rest}
      class={`inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${variantClass[local.variant ?? "secondary"]} ${sizeClass[local.size ?? "md"]} ${local.class ?? ""}`}
    >
      {local.children}
    </button>
  )
}
