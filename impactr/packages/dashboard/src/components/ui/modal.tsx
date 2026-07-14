import type { JSX } from "solid-js"
import { Show, onCleanup, onMount } from "solid-js"
import { Portal } from "solid-js/web"

export function Modal(props: { open: boolean; onClose: () => void; title: string; children: JSX.Element }) {
  const handleKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") props.onClose()
  }

  onMount(() => document.addEventListener("keydown", handleKey))
  onCleanup(() => document.removeEventListener("keydown", handleKey))

  return (
    <Show when={props.open}>
      <Portal>
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div class="absolute inset-0 bg-black/30" onClick={props.onClose} />
          <div class="relative w-full max-w-lg rounded-lg border border-border bg-surface shadow-xl">
            <div class="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 class="text-sm font-semibold text-foreground">{props.title}</h2>
              <button
                type="button"
                onClick={props.onClose}
                class="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-raised hover:text-foreground"
                aria-label="Close"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
                </svg>
              </button>
            </div>
            <div class="p-5">{props.children}</div>
          </div>
        </div>
      </Portal>
    </Show>
  )
}
