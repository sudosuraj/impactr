import { createAsync } from "@solidjs/router"
import { createSignal, For, Show } from "solid-js"
import { AppShell } from "~/components/layout/app-shell"
import { Page } from "~/components/ui/page"
import { Card, CardHeader } from "~/components/ui/card"
import { Tabs } from "~/components/ui/tabs"
import { Badge } from "~/components/ui/badge"
import { EmptyState } from "~/components/ui/empty-state"
import { getProfile, getTeamMembers } from "~/lib/data"

type Section = "profile" | "organization" | "team" | "notifications" | "billing"

function Field(props: { label: string; value: string }) {
  return (
    <div>
      <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">{props.label}</p>
      <p class="mt-1 text-sm text-foreground">{props.value}</p>
    </div>
  )
}

export default function Settings() {
  const [section, setSection] = createSignal<Section>("profile")
  const profile = createAsync(() => getProfile())
  const members = createAsync(() => getTeamMembers())

  return (
    <AppShell>
      <Page title="Settings" description="Your account, organization, and team">
        <Tabs
          active={section()}
          onChange={(value) => setSection(value as Section)}
          tabs={[
            { value: "profile", label: "Profile" },
            { value: "organization", label: "Organization" },
            { value: "team", label: "Team Members" },
            { value: "notifications", label: "Notifications" },
            { value: "billing", label: "Billing" },
          ]}
        />

        <div class="mt-4">
          <Show when={section() === "profile"}>
            <Card>
              <CardHeader title="Profile" description="Your account information" />
              <Show when={profile()}>
                {(p) => (
                  <div class="grid grid-cols-1 gap-5 p-5 sm:grid-cols-2">
                    <Field label="Name" value={p().name || "—"} />
                    <Field label="Email" value={p().email} />
                    <Field label="Role" value={p().role} />
                  </div>
                )}
              </Show>
            </Card>
          </Show>

          <Show when={section() === "organization"}>
            <Card>
              <CardHeader title="Organization" description="Your organization details" />
              <Show when={profile()}>
                {(p) => (
                  <div class="grid grid-cols-1 gap-5 p-5 sm:grid-cols-2">
                    <Field label="Name" value={p().organizationName} />
                    <Field label="Slug" value={p().organizationSlug} />
                  </div>
                )}
              </Show>
            </Card>
          </Show>

          <Show when={section() === "team"}>
            <Card>
              <CardHeader title="Team Members" description="People with access to this organization" />
              <Show when={members()}>
                {(list) => (
                  <Show when={list().length > 0} fallback={<EmptyState title="No team members" />}>
                    <ul>
                      <For each={list()}>
                        {(member) => (
                          <li class="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5 last:border-0">
                            <div class="min-w-0">
                              <p class="truncate text-sm font-medium text-foreground">{member.user.name}</p>
                              <p class="truncate text-xs text-muted-foreground">{member.user.email}</p>
                            </div>
                            <Badge class="capitalize">{member.role}</Badge>
                          </li>
                        )}
                      </For>
                    </ul>
                  </Show>
                )}
              </Show>
            </Card>
          </Show>

          <Show when={section() === "notifications"}>
            <Card>
              <EmptyState
                title="Notification settings aren't available yet"
                description="Alerts for new findings and scan activity are coming soon."
              />
            </Card>
          </Show>

          <Show when={section() === "billing"}>
            <Card>
              <EmptyState
                title="Billing isn't available yet"
                description="Plan and usage details are coming soon."
              />
            </Card>
          </Show>
        </div>
      </Page>
    </AppShell>
  )
}
