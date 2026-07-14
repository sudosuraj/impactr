import { A, createAsync } from "@solidjs/router"
import { For, Show } from "solid-js"
import { AppShell } from "~/components/layout/app-shell"
import { PageHeader } from "~/components/ui/page-header"
import { StatCard } from "~/components/ui/stat-card"
import { Card, CardHeader } from "~/components/ui/card"
import { SeverityBadge } from "~/components/ui/badge"
import { Timeline, type TimelineItem } from "~/components/ui/timeline"
import { EmptyState } from "~/components/ui/empty-state"
import { SkeletonCard } from "~/components/ui/skeleton"
import { Button } from "~/components/ui/button"
import { IconAssets, IconFindings, IconReports, IconScans } from "~/components/layout/icons"
import { getDashboard } from "~/lib/data"

const AUDIT_LABEL: Record<string, string> = {
  created: "Engagement created",
  authorized: "Engagement authorized",
  scope_changed: "Scope updated",
  revoked: "Engagement revoked",
  reactivated: "Engagement reactivated",
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function Dashboard() {
  const stats = createAsync(() => getDashboard())

  const activityItems = (): TimelineItem[] =>
    (stats()?.recentActivity ?? []).map((entry) => ({
      id: entry.id,
      title: AUDIT_LABEL[entry.action] ?? entry.action,
      time: timeAgo(entry.time_created),
      tone: entry.action === "revoked" ? "danger" : entry.action === "authorized" ? "success" : "neutral",
    }))

  return (
    <AppShell>
      <PageHeader title="Dashboard" description="Overview of your security posture" />
      <div class="space-y-6 p-8">
        <Show
          when={stats()}
          fallback={
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          }
        >
          {(data) => (
            <>
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  label="Security Score"
                  value={data().securityScore}
                  tone={data().securityScore >= 80 ? "success" : data().securityScore < 50 ? "danger" : "neutral"}
                  hint="Based on unresolved findings"
                />
                <StatCard label="Active Assets" value={data().activeAssetsCount} icon={<IconAssets />} />
                <StatCard label="Running Scans" value={data().runningScansCount} icon={<IconScans />} />
                <StatCard
                  label="Critical Findings"
                  value={data().criticalFindingsCount}
                  tone={data().criticalFindingsCount > 0 ? "danger" : "neutral"}
                  icon={<IconFindings />}
                />
              </div>

              <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader title="Recent Activity" description="Latest engagement events" />
                  <div class="p-5">
                    <Show
                      when={activityItems().length > 0}
                      fallback={<EmptyState title="No activity yet" description="Engagement events will show up here." />}
                    >
                      <Timeline items={activityItems()} />
                    </Show>
                  </div>
                </Card>

                <Card>
                  <CardHeader
                    title="Recent Findings"
                    description="Latest discoveries"
                    action={
                      <A href="/findings" class="text-sm text-muted-foreground hover:text-foreground">
                        View all
                      </A>
                    }
                  />
                  <Show
                    when={data().recentFindings.length > 0}
                    fallback={<EmptyState title="No findings yet" description="Findings will appear here as they're discovered." />}
                  >
                    <ul>
                      <For each={data().recentFindings}>
                        {(finding) => (
                          <li class="border-b border-border px-5 py-3 last:border-0">
                            <A href={`/findings/${finding.id}`} class="flex items-center justify-between gap-3">
                              <span class="truncate text-sm text-foreground">{finding.title}</span>
                              <SeverityBadge severity={finding.severity} />
                            </A>
                          </li>
                        )}
                      </For>
                    </ul>
                  </Show>
                </Card>
              </div>
            </>
          )}
        </Show>

        <Card>
          <CardHeader title="Quick Actions" />
          <div class="flex flex-wrap gap-3 p-5">
            <A href="/assets">
              <Button variant="secondary">
                <IconAssets class="h-4 w-4" /> View Assets
              </Button>
            </A>
            <A href="/scans">
              <Button variant="secondary">
                <IconScans class="h-4 w-4" /> View Scans
              </Button>
            </A>
            <A href="/findings">
              <Button variant="secondary">
                <IconFindings class="h-4 w-4" /> Review Findings
              </Button>
            </A>
            <A href="/reports">
              <Button variant="secondary">
                <IconReports class="h-4 w-4" /> Generate Report
              </Button>
            </A>
          </div>
        </Card>
      </div>
    </AppShell>
  )
}
