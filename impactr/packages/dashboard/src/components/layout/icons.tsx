import type { JSX } from "solid-js"

type IconProps = { class?: string }

function Icon(props: IconProps & { children: JSX.Element }) {
  return (
    <svg
      class={props.class ?? "h-4 w-4"}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.3"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {props.children}
    </svg>
  )
}

export const IconDashboard = (props: IconProps) => (
  <Icon {...props}>
    <rect x="2" y="2" width="5" height="5" rx="1" />
    <rect x="9" y="2" width="5" height="5" rx="1" />
    <rect x="2" y="9" width="5" height="5" rx="1" />
    <rect x="9" y="9" width="5" height="5" rx="1" />
  </Icon>
)

export const IconAssets = (props: IconProps) => (
  <Icon {...props}>
    <ellipse cx="8" cy="3.2" rx="5.5" ry="1.7" />
    <path d="M2.5 3.2v9.6c0 .94 2.46 1.7 5.5 1.7s5.5-.76 5.5-1.7V3.2" />
    <path d="M2.5 8c0 .94 2.46 1.7 5.5 1.7s5.5-.76 5.5-1.7" />
  </Icon>
)

export const IconScans = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M8 8 11 5.5" />
    <circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />
  </Icon>
)

export const IconFindings = (props: IconProps) => (
  <Icon {...props}>
    <path d="M8 1.5 13.5 3.5V7.5c0 3.5-2.3 5.7-5.5 7-3.2-1.3-5.5-3.5-5.5-7V3.5L8 1.5z" />
    <path d="M8 5.5v3M8 10.5h.01" />
  </Icon>
)

export const IconReports = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 1.5h6l2.5 2.5v10a.5.5 0 01-.5.5h-8a.5.5 0 01-.5-.5v-12a.5.5 0 01.5-.5z" />
    <path d="M10 1.5V4h2.5" />
    <path d="M5.5 8h5M5.5 10.5h5M5.5 5.5h2" />
  </Icon>
)

export const IconSettings = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="8" cy="8" r="2" />
    <path d="M8 1.5v2M8 12.5v2M2.7 4.2l1.4 1.4M11.9 10.4l1.4 1.4M1.5 8h2M12.5 8h2M2.7 11.8l1.4-1.4M11.9 5.6l1.4-1.4" />
  </Icon>
)
