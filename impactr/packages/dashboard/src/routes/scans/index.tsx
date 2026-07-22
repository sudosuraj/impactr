import { A, createAsync, useSubmission } from "@solidjs/router"
import { createMemo, createSignal, For, Show } from "solid-js"
import { AppShell } from "~/components/layout/app-shell"
import { Page, CountPill } from "~/components/ui/page"
import { Tabs } from "~/components/ui/tabs"
import { StatusBadge, type EngagementStatusTone } from "~/components/ui/badge"
import { EmptyState } from "~/components/ui/empty-state"
import { SkeletonTable } from "~/components/ui/skeleton"
import { Modal } from "~/components/ui/modal"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { IconScans } from "~/components/layout/icons"
import { getEngagements } from "~/lib/data"
import { createEngagement } from "~/lib/mutations"

const STATUS_TONE: Record<string, EngagementStatusTone> = {
  active: "active",
  authorized: "pending",
  draft: "pending",
  completed: "success",
  revoked: "danger",
}

type Bucket = "active" | "scheduled" | "completed"

function bucketOf(status: string): Bucket {
  if (status === "active") return "active"
  if (status === "draft" || status === "authorized") return "scheduled"
  return "completed"
}

export default function Scans() {
  const engagements = createAsync(() => getEngagements())
  const [tab, setTab] = createSignal<Bucket>("active")
  const [newOpen, setNewOpen] = createSignal(false)
  const submission = useSubmission(createEngagement)

  const grouped = createMemo(() => {
    const list = engagements() ?? []
    return {
      active: list.filter((row) => bucketOf(row.engagement.status) === "active"),
      scheduled: list.filter((row) => bucketOf(row.engagement.status) === "scheduled"),
      completed: list.filter((row) => bucketOf(row.engagement.status) === "completed"),
    }
  })

  const visible = () => grouped()[tab()]

  return (
    <AppShell>
      <Page
        title="Scans"
        description="Engagement activity started and tracked by your Impactr team"
        actions={
          <div class="flex items-center gap-3">
            <Show when={engagements()}>{(list) => <CountPill>{list().length} engagements</CountPill>}</Show>
            <Button variant="primary" size="sm" onClick={() => setNewOpen(true)}>
              New engagement
            </Button>
          </div>
        }
      >
        <Tabs
          active={tab()}
          onChange={(value) => setTab(value as Bucket)}
          tabs={[
            { value: "active", label: "Active", count: grouped().active.length },
            { value: "scheduled", label: "Scheduled", count: grouped().scheduled.length },
            { value: "completed", label: "Completed", count: grouped().completed.length },
          ]}
        />

        <div class="mt-4 rounded-lg border border-border bg-surface">
          <Show when={engagements()} fallback={<SkeletonTable />}>
            <Show
              when={visible().length > 0}
              fallback={
                <EmptyState
                  icon={<IconScans />}
                  title={`No ${tab()} scans`}
                  description="Scans your Impactr team starts against your authorized scope will show up here."
                />
              }
            >
              <ul>
                <For each={visible()}>
                  {(row) => (
                    <li class="border-b border-border last:border-0">
                      <A href={`/scans/${row.engagement.id}`} class="flex items-center justify-between gap-4 px-5 py-4 hover:bg-surface-raised">
                        <div class="min-w-0">
                          <p class="truncate text-sm font-medium text-foreground">{row.engagement.name}</p>
                          <p class="mt-0.5 text-xs text-muted-foreground">
                            {row.nodeCount} assets mapped · {row.compromisedCount} compromised
                          </p>
                        </div>
                        <StatusBadge label={row.engagement.status} tone={STATUS_TONE[row.engagement.status] ?? "neutral"} />
                      </A>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </Show>
        </div>
      </Page>

      <Modal open={newOpen()} onClose={() => setNewOpen(false)} title="New engagement">
        <form
          action={createEngagement}
          method="post"
          class="space-y-3"
        >
          <div>
            <label class="mb-1 block text-xs font-medium text-muted-foreground" for="engagement-name">
              Name
            </label>
            <Input id="engagement-name" name="name" required placeholder="Q3 external pentest" />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-muted-foreground" for="engagement-target">
              Authorized target
            </label>
            <Input id="engagement-target" name="target" required placeholder="acme.com" />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-muted-foreground" for="engagement-scope">
              Scope (optional, defaults to target)
            </label>
            <Input id="engagement-scope" name="scope" placeholder="*.acme.com" />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-muted-foreground" for="engagement-exclusions">
              Exclusions (comma-separated, optional)
            </label>
            <Input id="engagement-exclusions" name="exclusions" placeholder="billing.acme.com, status.acme.com" />
          </div>
          <Show when={submission.result?.error}>
            <p class="text-sm text-status-danger">{submission.result?.error}</p>
          </Show>
          <p class="text-xs text-muted-foreground">
            Submitting this authorizes the engagement under your organization. It does not yet start a live scan.
          </p>
          <div class="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setNewOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submission.pending}>
              {submission.pending ? "Creating…" : "Create engagement"}
            </Button>
          </div>
        </form>
      </Modal>
    </AppShell>
  )
}
