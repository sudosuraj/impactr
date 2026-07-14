import { A } from "@solidjs/router"
import type { JSX } from "solid-js"
import { logout } from "~/lib/auth"

export function Layout(props: { children: JSX.Element }) {
  return (
    <div class="min-h-screen bg-neutral-950 text-neutral-100">
      <nav class="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
        <div class="flex items-center gap-6">
          <span class="font-semibold">Impactr</span>
          <A href="/findings" class="text-sm text-neutral-400 hover:text-neutral-100" activeClass="text-neutral-100">
            Findings
          </A>
          <A href="/assets" class="text-sm text-neutral-400 hover:text-neutral-100" activeClass="text-neutral-100">
            Assets
          </A>
        </div>
        <form action={logout} method="post">
          <button type="submit" class="text-sm text-neutral-400 hover:text-neutral-100">
            Sign out
          </button>
        </form>
      </nav>
      <main class="p-6">{props.children}</main>
    </div>
  )
}
