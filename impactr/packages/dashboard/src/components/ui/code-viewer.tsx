import { createSignal, Show } from "solid-js"

export function CopyButton(props: { text: string }) {
  const [copied, setCopied] = createSignal(false)
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(props.text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      class="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
    >
      <Show
        when={!copied()}
        fallback={
          <>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M2.5 6.5 5 9l4.5-6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            Copied
          </>
        }
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <rect x="3.5" y="3.5" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.2" />
          <path d="M1.5 8.5v-6a1 1 0 011-1h6" stroke="currentColor" stroke-width="1.2" />
        </svg>
        Copy
      </Show>
    </button>
  )
}

export function CodeViewer(props: { code: string; label?: string }) {
  return (
    <div class="overflow-hidden rounded-md border border-border">
      <div class="flex items-center justify-between border-b border-border bg-surface-raised px-3 py-1.5">
        <span class="font-mono text-xs text-muted-foreground">{props.label ?? "code"}</span>
        <CopyButton text={props.code} />
      </div>
      <pre class="scrollbar-thin overflow-x-auto bg-surface p-3 font-mono text-xs leading-relaxed text-foreground">
        <code>{props.code}</code>
      </pre>
    </div>
  )
}
