import type { JSX } from "solid-js"

export type Severity = "critical" | "high" | "medium" | "low" | "info"
export type EngagementStatusTone = "success" | "active" | "pending" | "danger" | "neutral"

const severityDot: Record<Severity, string> = {
  critical: "bg-severity-critical",
  high: "bg-severity-high",
  medium: "bg-severity-medium",
  low: "bg-severity-low",
  info: "bg-severity-info",
}

const toneClass: Record<EngagementStatusTone, string> = {
  success: "bg-status-success/10 text-status-success",
  active: "bg-status-active/10 text-status-active",
  pending: "bg-status-pending/10 text-status-pending",
  danger: "bg-status-danger/10 text-status-danger",
  neutral: "bg-muted/10 text-muted-foreground",
}

export function SeverityBadge(props: { severity: string }) {
  const key = () => (props.severity in severityDot ? (props.severity as Severity) : "info")
  return (
    <span class="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs font-medium capitalize text-foreground">
      <span class={`h-1.5 w-1.5 rounded-full ${severityDot[key()]}`} />
      {props.severity}
    </span>
  )
}

export function StatusBadge(props: { label: string; tone: EngagementStatusTone }) {
  return (
    <span class={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${toneClass[props.tone]}`}>
      {props.label}
    </span>
  )
}

export function Badge(props: { children: JSX.Element; class?: string }) {
  return (
    <span
      class={`inline-flex items-center rounded-full border border-border bg-surface-raised px-2 py-0.5 text-xs font-medium text-muted-foreground ${props.class ?? ""}`}
    >
      {props.children}
    </span>
  )
}
