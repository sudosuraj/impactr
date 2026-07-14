import { createAsync } from "@solidjs/router"
import { For, Show } from "solid-js"
import { Layout } from "~/components/nav"
import { getAssets } from "~/lib/data"

export default function Assets() {
  const assets = createAsync(() => getAssets())

  return (
    <Layout>
      <h1 class="mb-6 text-xl font-semibold">Asset Inventory</h1>
      <Show when={assets()} fallback={<p class="text-neutral-500">Loading…</p>}>
        {(list) => (
          <Show when={list().length > 0} fallback={<p class="text-neutral-500">No assets discovered yet.</p>}>
            <div class="overflow-x-auto rounded-lg border border-neutral-800">
              <table class="w-full text-left text-sm">
                <thead class="border-b border-neutral-800 text-neutral-400">
                  <tr>
                    <th class="px-4 py-3 font-medium">Value</th>
                    <th class="px-4 py-3 font-medium">Type</th>
                    <th class="px-4 py-3 font-medium">Discovered</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={list()}>
                    {(asset) => (
                      <tr class="border-b border-neutral-900 last:border-0 hover:bg-neutral-900">
                        <td class="px-4 py-3 text-neutral-100">{asset.value}</td>
                        <td class="px-4 py-3 capitalize text-neutral-400">{asset.type}</td>
                        <td class="px-4 py-3 text-neutral-400">
                          {new Date(asset.discovered_at).toLocaleString()}
                        </td>
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
