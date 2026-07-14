export function ProgressBar(props: { value: number; max?: number; tone?: "neutral" | "success" | "danger" }) {
  const max = () => props.max ?? 100
  const pct = () => Math.max(0, Math.min(100, (props.value / max()) * 100))
  const fillClass = () =>
    props.tone === "danger" ? "bg-status-danger" : props.tone === "success" ? "bg-status-success" : "bg-foreground"

  return (
    <div class="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
      <div class={`h-full rounded-full transition-all ${fillClass()}`} style={{ width: `${pct()}%` }} />
    </div>
  )
}
