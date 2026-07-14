import { For } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { Portal } from "solid-js/web"

interface ToastItem {
  readonly id: number
  readonly title: string
  readonly description?: string
  readonly tone: "default" | "success" | "danger"
}

const [toasts, setToasts] = createStore<ToastItem[]>([])
let nextId = 0

export function toast(input: { title: string; description?: string; tone?: ToastItem["tone"] }) {
  const id = nextId++
  setToasts(
    produce((list) => {
      list.push({ id, title: input.title, description: input.description, tone: input.tone ?? "default" })
    }),
  )
  setTimeout(() => {
    setToasts((list) => list.filter((item) => item.id !== id))
  }, 4000)
}

const toneClass: Record<ToastItem["tone"], string> = {
  default: "border-border",
  success: "border-status-success/40",
  danger: "border-status-danger/40",
}

export function Toaster() {
  return (
    <Portal>
      <div class="fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
        <For each={toasts}>
          {(item) => (
            <div class={`rounded-lg border bg-surface px-4 py-3 shadow-lg ${toneClass[item.tone]}`}>
              <p class="text-sm font-medium text-foreground">{item.title}</p>
              {item.description && <p class="mt-0.5 text-xs text-muted-foreground">{item.description}</p>}
            </div>
          )}
        </For>
      </div>
    </Portal>
  )
}
