import type { JSX } from "solid-js"
import { Sidebar } from "./sidebar"
import { Toaster } from "~/components/ui/toast"

export function AppShell(props: { children: JSX.Element }) {
  return (
    <div class="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div class="flex-1 overflow-y-auto scrollbar-thin">{props.children}</div>
      <Toaster />
    </div>
  )
}
