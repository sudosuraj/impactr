import { Show } from "solid-js"

const W = 620
const H = 150
const PAD = 16

function build(series: number[], peak: number) {
  const n = series.length
  const max = Math.max(peak, 1)
  const pts = series.map((v, i) => {
    const x = n <= 1 ? W : (i / (n - 1)) * W
    const y = H - (v / max) * (H - PAD * 2) - PAD
    return [x, y] as const
  })
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")
  const area = `${line} L${W},${H} L0,${H} Z`
  return { line, area, last: pts[pts.length - 1] }
}

export function DiscoveryChart(props: {
  series: number[]
  peak: number
  current: number
  saturationPct: number
  spanHours: number
}) {
  const path = () => build(props.series, props.peak)

  return (
    <Show
      when={props.series.length > 1}
      fallback={<p class="py-8 text-center text-sm text-muted">Not enough activity yet to chart a discovery rate.</p>}
    >
      <div class="flex flex-col gap-5 md:flex-row md:items-center">
        <div class="min-w-0 flex-1">
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img" aria-label="Discovery rate over the engagement">
            <defs>
              <linearGradient id="disc-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="var(--brand)" stop-opacity="0.18" />
                <stop offset="1" stop-color="var(--brand)" stop-opacity="0" />
              </linearGradient>
            </defs>
            <line x1="0" y1={H * 0.28} x2={W} y2={H * 0.28} stroke="var(--border)" />
            <line x1="0" y1={H * 0.56} x2={W} y2={H * 0.56} stroke="var(--border)" />
            <line x1="0" y1={H * 0.84} x2={W} y2={H * 0.84} stroke="var(--border)" />
            <path d={path().area} fill="url(#disc-fill)" />
            <path d={path().line} fill="none" stroke="var(--brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            <circle cx={path().last[0]} cy={path().last[1]} r="4" fill="var(--brand)" stroke="var(--surface)" stroke-width="2" />
          </svg>
          <div class="mt-2 flex justify-between text-[11px] text-muted">
            <span>engagement start</span>
            <span>{props.spanHours}h runtime</span>
          </div>
        </div>
        <div class="flex-none border-t border-border pt-4 md:w-[168px] md:border-l md:border-t-0 md:pl-5 md:pt-0">
          <span class="text-[11px] font-medium uppercase tracking-wide text-muted">Saturation</span>
          <div class="mt-2 text-3xl font-semibold tracking-tight tnum">{props.saturationPct}%</div>
          <p class="mt-2 text-xs leading-relaxed text-muted">
            Now <span class="font-semibold text-foreground tnum">{props.current}</span>/hr vs peak{" "}
            <span class="font-semibold text-foreground tnum">{props.peak}</span>/hr. Below threshold the engine winds down
            and drafts the report.
          </p>
        </div>
      </div>
    </Show>
  )
}
