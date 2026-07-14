import { For, Show } from "solid-js"
import { EmptyState } from "~/components/ui/empty-state"

export interface Lead {
  readonly id: string
  readonly description: string
  readonly priority: number
  readonly status: string
}

export function WorkingLeads(props: { leads: Lead[] }) {
  return (
    <Show
      when={props.leads.length > 0}
      fallback={
        <div class="p-5">
          <EmptyState
            title="No open leads"
            description="Hypotheses the agent queues to investigate next appear here, ranked by potential."
          />
        </div>
      }
    >
      <ul class="divide-y divide-border">
        <For each={props.leads}>
          {(lead, i) => {
            const hi = lead.priority >= 0.6
            return (
              <li class="flex items-center gap-3 px-5 py-3">
                <span class="w-4 shrink-0 text-xs font-semibold tnum text-muted-foreground">{i() + 1}</span>
                <div class="min-w-0 flex-1">
                  <div class="truncate text-[13px] font-medium text-foreground">{lead.description}</div>
                  <div class="mt-0.5 text-[11px] uppercase tracking-wide text-muted">{lead.status}</div>
                </div>
                <div class="shrink-0 text-right">
                  <div class={`text-sm font-semibold tnum ${hi ? "text-brand" : "text-foreground"}`}>
                    {lead.priority.toFixed(2)}
                  </div>
                  <div class="mt-1 h-1 w-14 overflow-hidden rounded-full bg-surface-raised">
                    <div
                      class={`h-full rounded-full ${hi ? "bg-brand" : "bg-muted-foreground"}`}
                      style={{ width: `${Math.max(4, Math.min(100, Math.round(lead.priority * 100)))}%` }}
                    />
                  </div>
                </div>
              </li>
            )
          }}
        </For>
      </ul>
    </Show>
  )
}
