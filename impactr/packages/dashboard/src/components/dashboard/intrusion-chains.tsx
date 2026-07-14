import { For, Show } from "solid-js"
import { EmptyState } from "~/components/ui/empty-state"
import type { Chain } from "~/lib/command-center"

export function IntrusionChains(props: { chains: Chain[] }) {
  return (
    <Show
      when={props.chains.length > 0}
      fallback={
        <div class="p-5">
          <EmptyState
            title="No intrusion chains yet"
            description="Once the agent proves a path from foothold to impact, the assembled chain shows here."
          />
        </div>
      }
    >
      <div class="divide-y divide-border">
        <For each={props.chains}>
          {(chain) => (
            <div class="px-5 py-4">
              <div class="mb-3 flex items-center gap-3">
                <span class="truncate text-[13.5px] font-semibold text-foreground">{chain.name}</span>
                <span class="ml-auto shrink-0 rounded-md bg-severity-critical/10 px-2 py-0.5 text-[11px] font-semibold text-severity-critical">
                  {chain.impact}
                </span>
              </div>
              <div class="flex flex-wrap items-center gap-y-2 overflow-x-auto">
                <For each={chain.steps}>
                  {(step, i) => (
                    <>
                      <Show when={i() > 0}>
                        <span class="px-2 text-muted-foreground">→</span>
                      </Show>
                      <div
                        class={`min-w-[118px] rounded-lg border px-2.5 py-2 ${
                          step.end
                            ? "border-severity-critical/50 bg-severity-critical/[0.06]"
                            : "border-border-strong bg-surface-raised"
                        }`}
                      >
                        <div
                          class={`text-[10px] font-semibold uppercase tracking-wide ${
                            step.end ? "text-severity-critical" : "text-brand"
                          }`}
                        >
                          {step.phase}
                        </div>
                        <div class="mt-1 text-xs leading-snug text-foreground">{step.detail}</div>
                      </div>
                    </>
                  )}
                </For>
              </div>
            </div>
          )}
        </For>
      </div>
    </Show>
  )
}
