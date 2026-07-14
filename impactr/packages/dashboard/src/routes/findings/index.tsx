import { A, createAsync } from "@solidjs/router"
import { createSignal, For, Show } from "solid-js"
import { AppShell } from "~/components/layout/app-shell"
import { Page, CountPill } from "~/components/ui/page"
import { SearchInput } from "~/components/ui/input"
import { Select } from "~/components/ui/select"
import { Table, type Column } from "~/components/ui/table"
import { SeverityBadge, Badge } from "~/components/ui/badge"
import { EmptyState } from "~/components/ui/empty-state"
import { SkeletonTable } from "~/components/ui/skeleton"
import { IconFindings } from "~/components/layout/icons"
import { getFindings } from "~/lib/data"

const SEVERITY_OPTIONS = [
  { value: "", label: "All severities" },
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "info", label: "Info" },
]

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "open", label: "Open" },
  { value: "triaged", label: "Triaged" },
  { value: "remediated", label: "Remediated" },
  { value: "accepted_risk", label: "Accepted risk" },
  { value: "false_positive", label: "False positive" },
]

export default function Findings() {
  const [search, setSearch] = createSignal("")
  const [severity, setSeverity] = createSignal("")
  const [status, setStatus] = createSignal("")

  const findings = createAsync(() =>
    getFindings({ search: search() || undefined, severity: severity() || undefined, status: status() || undefined }),
  )

  const columns: Column<Awaited<ReturnType<typeof getFindings>>[number]>[] = [
    {
      header: "Title",
      cell: (finding) => (
        <A href={`/findings/${finding.id}`} class="font-medium text-foreground hover:underline">
          {finding.title}
        </A>
      ),
    },
    { header: "Severity", cell: (finding) => <SeverityBadge severity={finding.severity} /> },
    { header: "Status", cell: (finding) => <Badge class="capitalize">{finding.status.replace("_", " ")}</Badge> },
    { header: "CVSS", cell: (finding) => finding.cvss },
    { header: "Recorded", cell: (finding) => new Date(finding.time_created).toLocaleDateString() },
  ]

  return (
    <AppShell>
      <Page
        title="Findings"
        description="Vulnerabilities discovered across your engagements"
        actions={<Show when={findings()}>{(list) => <CountPill>{list().length} findings</CountPill>}</Show>}
      >
        <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div class="flex-1">
            <SearchInput
              placeholder="Search findings…"
              value={search()}
              onInput={(event) => setSearch(event.currentTarget.value)}
            />
          </div>
          <div class="w-full sm:w-44">
            <Select options={SEVERITY_OPTIONS} value={severity()} onChange={(event) => setSeverity(event.currentTarget.value)} />
          </div>
          <div class="w-full sm:w-44">
            <Select options={STATUS_OPTIONS} value={status()} onChange={(event) => setStatus(event.currentTarget.value)} />
          </div>
        </div>

        <div class="rounded-lg border border-border bg-surface">
          <Show when={findings()} fallback={<SkeletonTable />}>
            {(list) => (
              <Table
                columns={columns}
                rows={list()}
                rowKey={(finding) => finding.id}
                empty={
                  <EmptyState
                    icon={<IconFindings />}
                    title="No findings found"
                    description={search() || severity() || status() ? "Try a different search or filter." : "Findings will appear here as they're discovered."}
                  />
                }
              />
            )}
          </Show>
        </div>
      </Page>
    </AppShell>
  )
}
