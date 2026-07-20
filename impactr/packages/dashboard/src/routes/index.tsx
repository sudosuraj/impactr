import { createAsync, revalidate } from "@solidjs/router"
import { Show, createSignal, onCleanup } from "solid-js"
import { AppShell } from "~/components/layout/app-shell"
import { Card, CardHeader } from "~/components/ui/card"
import { SkeletonCard } from "~/components/ui/skeleton"
import { KpiTile } from "~/components/dashboard/kpi-tile"
import { DiscoveryChart } from "~/components/dashboard/discovery-chart"
import { ExposureRing } from "~/components/dashboard/exposure-ring"
import { IntrusionChains } from "~/components/dashboard/intrusion-chains"
import { WorkingLeads } from "~/components/dashboard/working-leads"
import { SurfaceTerrain } from "~/components/dashboard/surface-terrain"
import { AttackGraphMap } from "~/components/dashboard/attack-graph-map"
import { getCommandCenter } from "~/lib/command-center"

const LIVE_INTERVAL_MS = 5000

export default function Dashboard() {
  const data = createAsync(() => getCommandCenter())
  const [live, setLive] = createSignal(true)

  // Live view: re-run the command-center query on an interval so the graph, KPIs, and leads
  // track the engine as it maps the surface. Client-only (no server timers), paused on demand,
  // and cleaned up on unmount. `createAsync` re-resolves whenever the query is revalidated.
  if (typeof window !== "undefined") {
    const timer = setInterval(() => {
      if (live()) void revalidate(getCommandCenter.key)
    }, LIVE_INTERVAL_MS)
    onCleanup(() => clearInterval(timer))
  }

  return (
    <AppShell>
      <div class="mx-auto max-w-[1200px] px-6 py-7">
        <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 class="text-xl font-semibold tracking-tight text-foreground">Overview</h1>
            <p class="mt-1 text-sm text-muted">Authorized engagement · continuous discovery engine</p>
          </div>
          <Show when={data()}>
            {(d) => (
              <div class="inline-flex items-center gap-2">
                <span class="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[12.5px] text-muted">
                  <span class="relative flex h-[7px] w-[7px]">
                    <span
                      class={`h-[7px] w-[7px] rounded-full ${d().discovery.current > 0 ? "bg-brand agent-pulse" : "bg-muted-foreground"}`}
                    />
                  </span>
                  <Show when={d().discovery.current > 0} fallback={<span>Agent idle</span>}>
                    <span>
                      Agent <span class="font-semibold text-foreground">active</span>
                    </span>
                  </Show>
                  · tracking <span class="font-semibold text-foreground tnum">{d().kpis.surface}</span> assets
                </span>
                <button
                  type="button"
                  onClick={() => setLive((v) => !v)}
                  class="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-[12.5px] text-muted hover:text-foreground"
                  title={live() ? "Pause live updates" : "Resume live updates"}
                >
                  <span class={`h-[7px] w-[7px] rounded-full ${live() ? "bg-brand agent-pulse" : "bg-muted-foreground"}`} />
                  {live() ? "Live" : "Paused"}
                </button>
              </div>
            )}
          </Show>
        </div>

        <Show
          when={data()}
          fallback={
            <div class="space-y-4">
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </div>
              <SkeletonCard />
            </div>
          }
        >
          {(d) => (
            <div class="space-y-4">
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KpiTile
                  label="Surface surveilled"
                  value={d().kpis.surface}
                  sub="assets tracked this engagement"
                  delta={d().kpis.surfaceNew > 0 ? `+${d().kpis.surfaceNew}` : undefined}
                />
                <KpiTile
                  label="Footholds held"
                  value={d().kpis.footholds}
                  tone={d().kpis.footholds > 0 ? "critical" : "neutral"}
                  sub="compromised nodes in the graph"
                />
                <KpiTile
                  label="Exposure index"
                  value={d().kpis.exposure}
                  tone={d().kpis.exposure >= 30 ? "critical" : "neutral"}
                  sub={`${d().exposure.critical} critical · ${d().exposure.high} high open`}
                />
                <KpiTile label="Active leads" value={d().kpis.leads} sub="queued by potential score" />
              </div>

              <div class="grid grid-cols-1 gap-4 lg:grid-cols-[1.7fr_1fr]">
                <Card>
                  <CardHeader title="Discovery rate" description="New intel per hour, trending toward saturation" />
                  <div class="p-5">
                    <DiscoveryChart
                      series={d().discovery.series}
                      peak={d().discovery.peak}
                      current={d().discovery.current}
                      saturationPct={d().discovery.saturationPct}
                      spanHours={d().discovery.spanHours}
                    />
                  </div>
                </Card>
                <Card>
                  <CardHeader title="Exposure" description="Weighted by unresolved findings" />
                  <div class="p-3">
                    <ExposureRing
                      index={d().exposure.index}
                      critical={d().exposure.critical}
                      high={d().exposure.high}
                      medium={d().exposure.medium}
                    />
                  </div>
                </Card>
              </div>

              <div class="grid grid-cols-1 gap-4 lg:grid-cols-[1.7fr_1fr]">
                <Card>
                  <CardHeader title="Intrusion chains" description="Foothold → pivot → impact, assembled by the agent" />
                  <IntrusionChains chains={d().chains} />
                </Card>
                <Card>
                  <CardHeader title="Working leads" description="What the agent will chase next" />
                  <WorkingLeads leads={d().leads} />
                </Card>
              </div>

              <Card>
                <CardHeader
                  title="Attack graph"
                  description="Assets and the relationships the agent has drawn between them"
                />
                <AttackGraphMap nodes={d().graph.nodes} edges={d().graph.edges} />
              </Card>

              <Card>
                <CardHeader
                  title="Surface terrain"
                  description="Each cell is one asset, shaded by how deep the agent has gone"
                />
                <SurfaceTerrain terrain={d().terrain} />
              </Card>
            </div>
          )}
        </Show>
      </div>
    </AppShell>
  )
}
