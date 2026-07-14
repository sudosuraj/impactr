import { createAsync } from "@solidjs/router"
import { createSignal, For, Show } from "solid-js"
import { AppShell } from "~/components/layout/app-shell"
import { Page, CountPill } from "~/components/ui/page"
import { SearchInput } from "~/components/ui/input"
import { Select } from "~/components/ui/select"
import { Table, type Column } from "~/components/ui/table"
import { Badge } from "~/components/ui/badge"
import { EmptyState } from "~/components/ui/empty-state"
import { SkeletonTable } from "~/components/ui/skeleton"
import { Drawer } from "~/components/ui/drawer"
import { JsonViewer } from "~/components/ui/json-viewer"
import { IconAssets } from "~/components/layout/icons"
import { getAssets } from "~/lib/data"

const TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "domain", label: "Domain" },
  { value: "subdomain", label: "Subdomain" },
  { value: "ip", label: "IP" },
  { value: "url", label: "URL" },
  { value: "service", label: "Service" },
]

export default function Assets() {
  const [search, setSearch] = createSignal("")
  const [type, setType] = createSignal("")
  const [selected, setSelected] = createSignal<Awaited<ReturnType<typeof getAssets>>[number] | null>(null)

  const assets = createAsync(() =>
    getAssets({ search: search() || undefined, type: type() || undefined }),
  )

  const columns: Column<Awaited<ReturnType<typeof getAssets>>[number]>[] = [
    { header: "Value", cell: (asset) => <span class="font-medium">{asset.value}</span> },
    { header: "Type", cell: (asset) => <Badge class="capitalize">{asset.type}</Badge> },
    { header: "Discovered", cell: (asset) => new Date(asset.discovered_at).toLocaleDateString() },
  ]

  return (
    <AppShell>
      <Page
        title="Assets"
        description="Discovered attack surface for your engagements"
        actions={<Show when={assets()}>{(list) => <CountPill>{list().length} assets</CountPill>}</Show>}
      >
        <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div class="flex-1">
            <SearchInput
              placeholder="Search assets…"
              value={search()}
              onInput={(event) => setSearch(event.currentTarget.value)}
            />
          </div>
          <div class="w-full sm:w-48">
            <Select options={TYPE_OPTIONS} value={type()} onChange={(event) => setType(event.currentTarget.value)} />
          </div>
        </div>

        <div class="rounded-lg border border-border bg-surface">
          <Show when={assets()} fallback={<SkeletonTable />}>
            {(list) => (
              <Table
                columns={columns}
                rows={list()}
                rowKey={(asset) => asset.id}
                onRowClick={(asset) => setSelected(asset)}
                empty={
                  <EmptyState
                    icon={<IconAssets />}
                    title="No assets found"
                    description={search() || type() ? "Try a different search or filter." : "Discovered assets will appear here."}
                  />
                }
              />
            )}
          </Show>
        </div>
      </Page>

      <Drawer open={selected() !== null} onClose={() => setSelected(null)} title="Asset Details">
        <Show when={selected()}>
          {(asset) => (
            <div class="space-y-5 p-5">
              <div>
                <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Value</p>
                <p class="mt-1 text-sm text-foreground">{asset().value}</p>
              </div>
              <div>
                <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Type</p>
                <p class="mt-1 text-sm capitalize text-foreground">{asset().type}</p>
              </div>
              <div>
                <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Discovered</p>
                <p class="mt-1 text-sm text-foreground">{new Date(asset().discovered_at).toLocaleString()}</p>
              </div>
              <div>
                <p class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Attributes</p>
                <JsonViewer data={asset().attributes} label="attributes" />
              </div>
            </div>
          )}
        </Show>
      </Drawer>
    </AppShell>
  )
}
