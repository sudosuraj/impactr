import { Show } from "solid-js"
import { CodeViewer } from "./code-viewer"

export interface HttpMessage {
  readonly method?: string
  readonly url?: string
  readonly status?: number
  readonly headers: Readonly<Record<string, string>>
  readonly body?: string
}

function formatHeaders(headers: Readonly<Record<string, string>>): string {
  return Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n")
}

export function HttpRequestViewer(props: { request: HttpMessage }) {
  return (
    <div class="space-y-2">
      <div class="flex items-center gap-2 font-mono text-xs">
        <span class="rounded bg-status-active/10 px-1.5 py-0.5 font-semibold text-status-active">{props.request.method}</span>
        <span class="truncate text-muted-foreground">{props.request.url}</span>
      </div>
      <CodeViewer label="headers" code={formatHeaders(props.request.headers)} />
      <Show when={props.request.body}>
        <CodeViewer label="body" code={props.request.body!} />
      </Show>
    </div>
  )
}

export function HttpResponseViewer(props: { response: HttpMessage }) {
  const statusTone = () => {
    const status = props.response.status ?? 0
    if (status >= 500) return "bg-severity-critical/10 text-severity-critical"
    if (status >= 400) return "bg-severity-high/10 text-severity-high"
    return "bg-status-success/10 text-status-success"
  }

  return (
    <div class="space-y-2">
      <div class="flex items-center gap-2 font-mono text-xs">
        <span class={`rounded px-1.5 py-0.5 font-semibold ${statusTone()}`}>{props.response.status}</span>
      </div>
      <CodeViewer label="headers" code={formatHeaders(props.response.headers)} />
      <Show when={props.response.body}>
        <CodeViewer label="body" code={props.response.body!} />
      </Show>
    </div>
  )
}

export function HttpExchangeViewer(props: { request: HttpMessage; response?: HttpMessage }) {
  return (
    <div class="grid gap-4 md:grid-cols-2">
      <div>
        <h3 class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Request</h3>
        <HttpRequestViewer request={props.request} />
      </div>
      <div>
        <h3 class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Response</h3>
        <Show
          when={props.response}
          fallback={<p class="text-sm text-muted-foreground">No response captured.</p>}
        >
          {(response) => <HttpResponseViewer response={response()} />}
        </Show>
      </div>
    </div>
  )
}
