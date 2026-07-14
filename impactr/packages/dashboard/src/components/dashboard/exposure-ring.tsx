const CIRC = 2 * Math.PI * 52

export function ExposureRing(props: { index: number; critical: number; high: number; medium: number }) {
  const value = () => Math.max(0, Math.min(100, Math.round(props.index)))
  const color = () =>
    value() >= 60 ? "var(--severity-critical)" : value() >= 30 ? "var(--severity-high)" : "var(--brand)"
  const offset = () => CIRC * (1 - value() / 100)

  return (
    <div class="flex h-full flex-col items-center justify-center gap-2 py-2">
      <div class="relative">
        <svg width="128" height="128" viewBox="0 0 128 128">
          <circle cx="64" cy="64" r="52" fill="none" stroke="var(--border)" stroke-width="10" />
          <circle
            cx="64"
            cy="64"
            r="52"
            fill="none"
            stroke={color()}
            stroke-width="10"
            stroke-linecap="round"
            stroke-dasharray={CIRC}
            stroke-dashoffset={offset()}
            transform="rotate(-90 64 64)"
            style={{ transition: "stroke-dashoffset .8s ease" }}
          />
        </svg>
        <div class="absolute inset-0 flex flex-col items-center justify-center">
          <span class="text-3xl font-semibold tracking-tight tnum text-foreground">{value()}</span>
          <span class="text-[10.5px] uppercase tracking-wider text-muted">/ 100</span>
        </div>
      </div>
      <p class="max-w-[160px] text-center text-xs text-muted">
        {value() >= 60 ? "High exposure" : value() >= 30 ? "Moderate exposure" : "Low exposure"} — weighted by unresolved
        findings.
      </p>
      <div class="mt-1 flex gap-5">
        <Pip n={props.critical} label="Critical" class="text-severity-critical" />
        <Pip n={props.high} label="High" class="text-severity-high" />
        <Pip n={props.medium} label="Medium" class="text-foreground" />
      </div>
    </div>
  )
}

function Pip(props: { n: number; label: string; class: string }) {
  return (
    <div class="flex flex-col items-center gap-0.5">
      <span class={`text-[15px] font-semibold tnum ${props.class}`}>{props.n}</span>
      <span class="text-[10.5px] uppercase tracking-wide text-muted">{props.label}</span>
    </div>
  )
}
