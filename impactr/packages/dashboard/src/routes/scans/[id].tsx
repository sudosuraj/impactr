import { A, createAsync, useParams } from "@solidjs/router"
import { For, Show } from "solid-js"
import { AppShell } from "~/components/layout/app-shell"
import { Page } from "~/components/ui/page"
import { Card, CardHeader } from "~/components/ui/card"
import { StatCard } from "~/components/ui/stat-card"
import { StatusBadge, type EngagementStatusTone } from "~/components/ui/badge"
import { Timeline, type TimelineItem } from "~/components/ui/timeline"
import { EmptyState } from "~/components/ui/empty-state"
import { getEngagementDetail } from "~/lib/data"

const STATUS_TONE: Record<string, EngagementStatusTone> = {
  active: "active",
  authorized: "pending",
  draft: "pending",
  completed: "success",
  revoked: "danger",
}

function eventLabel(event: { kind: string; data: any }): string {
  if (event.kind === "asset") return `Discovered ${event.data.type}: ${event.data.value}`
  if (event.kind === "finding") return `Recorded finding: ${event.data.title}`
  return `Engagement ${event.data.action.replace("_", " ")}`
}

export default function ScanDetail() {
  const params = useParams()
  const detail = createAsync(() => getEngagementDetail(params.id ?? ""))

  const timelineItems = (): TimelineItem[] =>
    (detail()?.timeline ?? []).map((event) => ({
      id: event.id,
      title: eventLabel(event),
      time: new Date(event.time).toLocaleString(),
      tone: event.kind === "finding" ? "danger" : event.kind === "asset" ? "active" : "neutral",
    }))

  return (
    <AppShell>
      <Show when={detail()} fallback={<Page title="Scan"><div class="text-sm text-muted">Loading…</div></Page>}>
        {(data) => (
          <Page
            title={data().engagement.name}
            description="Engagement scope and progress"
            actions={<StatusBadge label={data().engagement.status} tone={STATUS_TONE[data().engagement.status] ?? "neutral"} />}
          >
            <A href="/scans" class="text-sm text-muted hover:text-foreground">
              ← Back to scans
            </A>
            <div class="mt-6 space-y-6">

              <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatCard label="Assets Mapped" value={data().graph.totalNodes} />
                <StatCard label="Relationships" value={data().graph.totalEdges} />
                <StatCard
                  label="Compromised"
                  value={data().graph.byStatus.compromised ?? 0}
                  tone={(data().graph.byStatus.compromised ?? 0) > 0 ? "danger" : "neutral"}
                />
              </div>

              <Card>
                <CardHeader title="Authorized Scope" />
                <div class="space-y-3 p-5">
                  <div>
                    <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Target</p>
                    <p class="mt-1 text-sm text-foreground">
                      {data().engagement.scope.target.name} — {data().engagement.scope.target.scope}
                    </p>
                  </div>
                  <Show when={data().engagement.scope.target.exclusions.length > 0}>
                    <div>
                      <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Exclusions</p>
                      <div class="mt-1 flex flex-wrap gap-1.5">
                        <For each={data().engagement.scope.target.exclusions}>
                          {(exclusion) => (
                            <span class="rounded-full border border-border bg-surface-raised px-2 py-0.5 text-xs text-muted-foreground">
                              {exclusion}
                            </span>
                          )}
                        </For>
                      </div>
                    </div>
                  </Show>
                </div>
              </Card>

              <Card>
                <CardHeader title="Attack Timeline" description="Chronological discovery and status events" />
                <div class="p-5">
                  <Show
                    when={timelineItems().length > 0}
                    fallback={<EmptyState title="No activity yet" description="Discoveries and findings for this scan will appear here." />}
                  >
                    <Timeline items={timelineItems()} />
                  </Show>
                </div>
              </Card>
            </div>
          </Page>
        )}
      </Show>
    </AppShell>
  )
}
