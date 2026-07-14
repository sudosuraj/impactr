import { A, createAsync } from "@solidjs/router"
import { For, Show } from "solid-js"
import { getViewer } from "~/lib/data"
import { logout } from "~/lib/auth"
import { ThemeToggle } from "~/components/ui/theme-toggle"
import { IconAssets, IconDashboard, IconFindings, IconReports, IconScans, IconSettings } from "./icons"

const NAV = [
  { href: "/", label: "Dashboard", icon: IconDashboard },
  { href: "/assets", label: "Assets", icon: IconAssets },
  { href: "/scans", label: "Scans", icon: IconScans },
  { href: "/findings", label: "Findings", icon: IconFindings },
  { href: "/reports", label: "Reports", icon: IconReports },
  { href: "/settings", label: "Settings", icon: IconSettings },
] as const

export function Sidebar() {
  const viewer = createAsync(() => getViewer())

  return (
    <aside class="flex h-full w-60 shrink-0 flex-col border-r border-border bg-surface">
      <div class="flex h-14 items-center gap-2 px-5">
        <div class="flex h-6 w-6 items-center justify-center rounded bg-accent text-accent-foreground">
          <span class="text-xs font-bold">I</span>
        </div>
        <span class="text-sm font-semibold text-foreground">Impactr</span>
      </div>

      <nav class="flex-1 space-y-0.5 px-3 py-2">
        <For each={NAV}>
          {(item) => (
            <A
              href={item.href}
              end={item.href === "/"}
              class="relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors before:absolute before:left-0 before:top-1/2 before:h-4 before:w-[2px] before:-translate-y-1/2 before:rounded-full before:bg-transparent before:content-[''] hover:bg-surface-raised hover:text-foreground"
              activeClass="!bg-surface-raised !text-foreground font-medium before:!bg-brand"
            >
              <item.icon class="h-4 w-4 shrink-0" />
              {item.label}
            </A>
          )}
        </For>
      </nav>

      <div class="border-t border-border p-3">
        <Show when={viewer()}>
          {(v) => (
            <div class="mb-2 px-2">
              <p class="truncate text-xs font-medium text-foreground">{v().organizationName}</p>
              <p class="truncate text-xs text-muted-foreground">{v().email}</p>
            </div>
          )}
        </Show>
        <div class="flex items-center gap-2">
          <form action={logout} method="post" class="flex-1">
            <button
              type="submit"
              class="w-full rounded-md px-2.5 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
            >
              Sign out
            </button>
          </form>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  )
}
