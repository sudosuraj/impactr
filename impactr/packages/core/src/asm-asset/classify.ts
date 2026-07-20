export * as AsmAssetClassify from "./classify"

import type { PlaybookName } from "../session/playbook"

/**
 * A seed asset the operator scoped the engagement to, classified into the shape that decides how
 * Impactr should begin discovering the attack surface around it. This is the "Add a domain, IP, or
 * subdomain as an asset" primitive: a domain fans out into subdomain enumeration, an IP into a port
 * sweep, a URL into HTTP probing — the first move differs by kind, so we classify before we scan.
 *
 * Richer than the persisted `AsmAsset.Type` on purpose: `wildcard` and `cidr` are distinct *seeds*
 * (they expand into many assets) even though what they discover collapses back to domain/ip assets.
 */
export type SeedAssetType = "domain" | "subdomain" | "ip" | "cidr" | "url" | "wildcard"

export interface SeedAsset {
  readonly type: SeedAssetType
  /** The normalized seed value (lower-cased host, wildcard reduced to its root domain, etc.). */
  readonly value: string
  /** For a wildcard/subdomain, the registrable root the org's surface hangs off — used for OSINT. */
  readonly root?: string
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
const CIDR = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/
// Pragmatic IPv6 recognizer: hex groups and shorthand `::`, enough to route a seed to a port sweep.
const IPV6 = /^(([0-9a-f]{1,4}:){2,7}[0-9a-f]{0,4}|::([0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})$/i
const HOSTNAME = /^(?=.{1,253}$)([a-z0-9](-*[a-z0-9])*\.)+[a-z]{2,}$/

const octetsInRange = (parts: ReadonlyArray<string>) => parts.every((p) => Number(p) <= 255)

/** True for a bare IPv4/IPv6 host (brackets stripped) — an IP has no registrable root to compute. */
const isIpHost = (host: string): boolean => IPV4.test(host) || IPV6.test(host.replace(/^\[|\]$/g, ""))

/** The registrable root domain (last two labels) of a hostname — a coarse eTLD-agnostic reduction. */
const rootOf = (host: string): string => {
  const labels = host.split(".")
  return labels.length <= 2 ? host : labels.slice(-2).join(".")
}

/**
 * Classify one scope token into a seed asset, or `undefined` when it is not a recognizable target.
 * Deterministic and dependency-free so it is unit-testable against fixed inputs.
 */
export const classifyToken = (raw: string): SeedAsset | undefined => {
  const token = raw.trim()
  if (token.length === 0) return undefined

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(token)) {
    try {
      const url = new URL(token)
      const hostname = url.hostname.toLowerCase()
      const value = url.origin.toLowerCase() + (url.pathname === "/" ? "" : url.pathname)
      // A bare IP host has no registrable root — computing one from dotted octets would produce
      // a nonsensical OSINT target (e.g. rootOf("10.0.0.1") => "0.1").
      return isIpHost(hostname) ? { type: "url", value } : { type: "url", value, root: rootOf(hostname) }
    } catch {
      return undefined
    }
  }

  const cidr = CIDR.exec(token)
  if (cidr) {
    const prefix = Number(cidr[5])
    if (octetsInRange(cidr.slice(1, 5)) && prefix <= 32) return { type: "cidr", value: token }
    return undefined
  }

  const ipv4 = IPV4.exec(token)
  if (ipv4) return octetsInRange(ipv4.slice(1, 5)) ? { type: "ip", value: token } : undefined
  if (IPV6.test(token)) return { type: "ip", value: token.toLowerCase() }

  if (token.startsWith("*.")) {
    const host = token.slice(2).toLowerCase()
    return HOSTNAME.test(host) ? { type: "wildcard", value: host, root: rootOf(host) } : undefined
  }

  const host = token.toLowerCase().replace(/\.$/, "")
  if (HOSTNAME.test(host)) {
    const labels = host.split(".")
    // Two labels is the registrable apex (acme.com); three or more is a subdomain (api.acme.com).
    return labels.length <= 2
      ? { type: "domain", value: host, root: host }
      : { type: "subdomain", value: host, root: rootOf(host) }
  }

  return undefined
}

/**
 * Classify a full scope string (the operator's `--scope`, e.g. `*.acme.com, 10.0.0.0/24, api.acme.com`)
 * into deduplicated seed assets. Splits on commas and whitespace so either separator works.
 */
export const classifyScope = (scope: string): ReadonlyArray<SeedAsset> => {
  const seen = new Set<string>()
  const assets: SeedAsset[] = []
  for (const token of scope.split(/[\s,]+/)) {
    const asset = classifyToken(token)
    if (!asset) continue
    const key = `${asset.type}:${asset.value}`
    if (seen.has(key)) continue
    seen.add(key)
    assets.push(asset)
  }
  return assets
}

/** The recon technique to reach for first on a given seed kind — the opening move of discovery. */
const FIRST_MOVE: Record<SeedAssetType, string> = {
  domain: "enumerate_subdomains (map the surface), then probe_http on each live host",
  wildcard: "enumerate_subdomains (map the surface), then probe_http on each live host",
  subdomain: "resolve_dns then probe_http (fingerprint the host directly)",
  ip: "scan_ports (find exposed services), then probe_http on web ports",
  cidr: "scan_ports across the range for host + service discovery",
  url: "probe_http then crawl_site (walk the reachable surface)",
}

/**
 * Pick the starting methodology to seed the plan from the mix of seed kinds. Network seeds
 * (ip/cidr) start from the external-network playbook; anything web-facing starts from web-app.
 * A blank scope yields no recommendation.
 */
export const recommendPlaybook = (assets: ReadonlyArray<SeedAsset>): PlaybookName | undefined => {
  if (assets.length === 0) return undefined
  const hasWeb = assets.some((a) => a.type === "domain" || a.type === "subdomain" || a.type === "url" || a.type === "wildcard")
  if (hasWeb) return "web-app"
  return "external-network"
}

/**
 * Render the ASM discovery kickoff for the classified seed — the concrete "run the engagement from
 * here" plan the orchestrator reads out of `get_scope`. Includes a dark-web / breach credential-leak
 * OSINT step for each registrable root, since leaked credentials are part of the attack surface.
 * Returns "" when nothing classifiable was scoped.
 */
export const renderKickoff = (assets: ReadonlyArray<SeedAsset>): string => {
  if (assets.length === 0) return ""
  const lines: string[] = []
  lines.push("Seed assets (attack-surface discovery starts here):")
  for (const a of assets) lines.push(`- ${a.type}: ${a.value} → ${FIRST_MOVE[a.type]}`)

  const roots = [...new Set(assets.map((a) => a.root).filter((r): r is string => r !== undefined))]
  if (roots.length > 0)
    lines.push(
      `- credential-leak OSINT: search public breach/dark-web corpora for leaked credentials on ${roots.join(", ")}`,
    )

  const playbook = recommendPlaybook(assets)
  if (playbook) lines.push(`Recommended starting playbook: attack_plan(action:"seed", playbook:"${playbook}").`)
  return lines.join("\n")
}
