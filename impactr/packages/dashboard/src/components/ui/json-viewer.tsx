import { CodeViewer } from "./code-viewer"

export function JsonViewer(props: { data: unknown; label?: string }) {
  return <CodeViewer code={JSON.stringify(props.data, null, 2)} label={props.label ?? "json"} />
}
