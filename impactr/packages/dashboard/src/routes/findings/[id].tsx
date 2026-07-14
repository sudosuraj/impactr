import { A, createAsync, useParams } from "@solidjs/router"
import { createSignal, Show } from "solid-js"
import { AppShell } from "~/components/layout/app-shell"
import { Page } from "~/components/ui/page"
import { Card } from "~/components/ui/card"
import { Tabs } from "~/components/ui/tabs"
import { SeverityBadge, Badge } from "~/components/ui/badge"
import { EmptyState } from "~/components/ui/empty-state"
import { getFindingDetail } from "~/lib/data"

type Tab = "overview" | "evidence" | "remediation"

export default function FindingDetail() {
  const params = useParams()
  const finding = createAsync(() => getFindingDetail(params.id ?? ""))
  const [tab, setTab] = createSignal<Tab>("overview")

  return (
    <AppShell>
      <Show when={finding()} fallback={<Page title="Finding"><div class="text-sm text-muted">Loading…</div></Page>}>
        {(f) => (
          <Page
            title={f().title}
            description={`CVSS ${f().cvss}`}
            actions={
              <>
                <SeverityBadge severity={f().severity} />
                <Badge class="capitalize">{f().status.replace("_", " ")}</Badge>
              </>
            }
          >
            <A href="/findings" class="text-sm text-muted hover:text-foreground">
              ← Back to findings
            </A>

            <div class="mt-5 space-y-5">
              <Tabs
                active={tab()}
                onChange={(value) => setTab(value as Tab)}
                tabs={[
                  { value: "overview", label: "Overview" },
                  { value: "evidence", label: "Evidence" },
                  { value: "remediation", label: "Remediation" },
                ]}
              />

              <Show when={tab() === "overview"}>
                <Card>
                  <div class="space-y-6 p-5">
                    <div>
                      <h3 class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Description</h3>
                      <p class="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{f().description}</p>
                    </div>
                    <div>
                      <h3 class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Impact</h3>
                      <p class="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{f().impact}</p>
                    </div>
                  </div>
                </Card>
              </Show>

              <Show when={tab() === "evidence"}>
                <Card>
                  <EmptyState
                    title="No structured evidence captured"
                    description="HTTP requests, responses, and proof-of-concept artifacts for this finding weren't captured separately — check the description above for reproduction details."
                  />
                </Card>
              </Show>

              <Show when={tab() === "remediation"}>
                <Card>
                  <div class="p-5">
                    <p class="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{f().remediation}</p>
                  </div>
                </Card>
              </Show>
            </div>
          </Page>
        )}
      </Show>
    </AppShell>
  )
}
