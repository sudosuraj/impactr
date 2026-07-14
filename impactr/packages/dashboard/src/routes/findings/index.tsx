import { A, createAsync } from "@solidjs/router"
import { For, Show } from "solid-js"
import { Layout } from "~/components/nav"
import { getFindings } from "~/lib/data"

const severityColor: Record<string, string> = {
  critical: "text-red-400",
  high: "text-orange-400",
  medium: "text-yellow-400",
  low: "text-blue-400",
  info: "text-neutral-400",
}

export default function Findings() {
  const findings = createAsync(() => getFindings())

  return (
    <Layout>
      <h1 class="mb-6 text-xl font-semibold">Findings</h1>
      <Show when={findings()} fallback={<p class="text-neutral-500">Loading…</p>}>
        {(list) => (
          <Show when={list().length > 0} fallback={<p class="text-neutral-500">No findings recorded yet.</p>}>
            <div class="overflow-x-auto rounded-lg border border-neutral-800">
              <table class="w-full text-left text-sm">
                <thead class="border-b border-neutral-800 text-neutral-400">
                  <tr>
                    <th class="px-4 py-3 font-medium">Title</th>
                    <th class="px-4 py-3 font-medium">Severity</th>
                    <th class="px-4 py-3 font-medium">Status</th>
                    <th class="px-4 py-3 font-medium">CVSS</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={list()}>
                    {(finding) => (
                      <tr class="border-b border-neutral-900 last:border-0 hover:bg-neutral-900">
                        <td class="px-4 py-3">
                          <A href={`/findings/${finding.id}`} class="text-neutral-100 hover:underline">
                            {finding.title}
                          </A>
                        </td>
                        <td class={`px-4 py-3 capitalize ${severityColor[finding.severity] ?? "text-neutral-400"}`}>
                          {finding.severity}
                        </td>
                        <td class="px-4 py-3 capitalize text-neutral-400">{finding.status.replace("_", " ")}</td>
                        <td class="px-4 py-3 text-neutral-400">{finding.cvss}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>
        )}
      </Show>
    </Layout>
  )
}
