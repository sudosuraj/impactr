export * as TechniqueParse from "./parse"

import type { Asset, Parsed, Relation } from "./asset"
import {
  credentialId,
  empty,
  endpointId,
  ipId,
  merge,
  portId,
  subdomainId,
  vulnerabilityId,
} from "./asset"

/**
 * Pure parsers: one per engine, each turning the engine's raw stdout into normalized assets and
 * relations. No I/O, no graph — just parsing — so they are fully unit-tested against fixtures and
 * stay correct without a live target. A technique tool = one of these + a shell-out + ingestion.
 */

/** Yield parsed JSON objects from JSONL/NDJSON output, skipping blank and unparseable lines. */
const jsonl = (stdout: string): Array<Record<string, unknown>> => {
  const out: Array<Record<string, unknown>> = []
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const value = JSON.parse(trimmed)
      if (value && typeof value === "object") out.push(value as Record<string, unknown>)
    } catch {
      // Not JSON — parsers that also accept plain-text lines handle that themselves.
    }
  }
  return out
}

const lines = (stdout: string) =>
  stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

const asString = (value: unknown): string | undefined => (typeof value === "string" && value ? value : undefined)
const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []

/** subfinder: `-silent` plain host lines, or `-json` objects `{host}`. */
export const subfinder = (stdout: string): Parsed => {
  const hosts = new Set<string>()
  for (const row of jsonl(stdout)) {
    const host = asString(row.host)
    if (host) hosts.add(host)
  }
  for (const line of lines(stdout)) if (!line.startsWith("{")) hosts.add(line)
  return { assets: [...hosts].map((host) => ({ id: subdomainId(host), type: "subdomain", label: host })), relations: [] }
}

/** dnsx `-json`: `{host, a:[…], aaaa:[…], cname:[…]}` → subdomain + ip assets, resolves_to edges. */
export const dnsx = (stdout: string): Parsed => {
  const assets = new Map<string, Asset>()
  const relations: Relation[] = []
  for (const row of jsonl(stdout)) {
    const host = asString(row.host)
    if (!host) continue
    assets.set(subdomainId(host), { id: subdomainId(host), type: "subdomain", label: host })
    for (const ip of [...asStringArray(row.a), ...asStringArray(row.aaaa)]) {
      assets.set(ipId(ip), { id: ipId(ip), type: "ip", label: ip })
      relations.push({ source: subdomainId(host), target: ipId(ip), relation: "resolves_to" })
    }
    for (const cname of asStringArray(row.cname)) {
      assets.set(subdomainId(cname), { id: subdomainId(cname), type: "subdomain", label: cname })
      relations.push({ source: subdomainId(host), target: subdomainId(cname), relation: "resolves_to", attributes: { kind: "cname" } })
    }
  }
  return { assets: [...assets.values()], relations }
}

const isIpv4 = (host: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(host)

/** naabu `-json` `{host|ip, port}`, or plain `host:port` lines → ip/subdomain + port assets, exposes edges. */
export const naabu = (stdout: string): Parsed => {
  const assets = new Map<string, Asset>()
  const relations: Relation[] = []
  const add = (host: string, port: number | string) => {
    // A naabu target may be a hostname, not an IP; don't mislabel it as an ip node.
    const hostAsset: Asset = isIpv4(host)
      ? { id: ipId(host), type: "ip", label: host }
      : { id: subdomainId(host), type: "subdomain", label: host }
    assets.set(hostAsset.id, hostAsset)
    const pid = portId(host, port)
    assets.set(pid, { id: pid, type: "port", label: `${host}:${port}`, attributes: { port: Number(port) } })
    relations.push({ source: hostAsset.id, target: pid, relation: "exposes" })
  }
  for (const row of jsonl(stdout)) {
    const host = asString(row.ip) ?? asString(row.host)
    if (host && row.port !== undefined) add(host, row.port as number)
  }
  for (const line of lines(stdout)) {
    if (line.startsWith("{")) continue
    const match = line.match(/^([^\s:]+):(\d+)$/)
    if (match) add(match[1], match[2])
  }
  return { assets: [...assets.values()], relations }
}

/** httpx `-json`: `{url, input, status_code, title, webserver, tech:[…]}` → endpoint assets. */
export const httpx = (stdout: string): Parsed => {
  const assets = new Map<string, Asset>()
  const relations: Relation[] = []
  for (const row of jsonl(stdout)) {
    const url = asString(row.url)
    if (!url) continue
    const attributes: Record<string, unknown> = {}
    if (row.status_code !== undefined) attributes.status = row.status_code
    const title = asString(row.title)
    if (title) attributes.title = title
    const webserver = asString(row.webserver)
    if (webserver) attributes.webserver = webserver
    const tech = asStringArray(row.tech)
    if (tech.length) attributes.tech = tech
    assets.set(endpointId(url), { id: endpointId(url), type: "endpoint", label: url, attributes })
    const host = asString(row.input) ?? asString(row.host)
    if (host) {
      assets.set(subdomainId(host), { id: subdomainId(host), type: "subdomain", label: host })
      relations.push({ source: subdomainId(host), target: endpointId(url), relation: "exposes" })
    }
  }
  return { assets: [...assets.values()], relations }
}

/**
 * nuclei `-jsonl` → vulnerability assets, each linked to the endpoint/host it was matched at via a
 * `vulnerable_to` edge so exploit chains form in the graph. This is the one technique that finds the
 * bugs (CVEs, misconfigs, exposures) rather than just mapping surface. Severity is carried on both
 * the node and the edge so chain-hunting can weight by impact.
 */
export const nuclei = (stdout: string): Parsed => {
  const assets = new Map<string, Asset>()
  const relations: Relation[] = []
  for (const row of jsonl(stdout)) {
    const templateId = asString(row["template-id"]) ?? asString(row.templateID) ?? asString(row.template_id)
    const info = (row.info && typeof row.info === "object" ? row.info : {}) as Record<string, unknown>
    const severity = (asString(info.severity) ?? "unknown").toLowerCase()
    const name = asString(info.name) ?? templateId ?? "finding"
    const matchedAt = asString(row["matched-at"]) ?? asString(row.matched_at) ?? asString(row.url)
    const host = asString(row.host)
    const location = matchedAt ?? host
    if (!templateId && !location) continue
    const kind = templateId ?? "finding"
    const vid = vulnerabilityId(kind, location ?? "unknown")
    const attributes: Record<string, unknown> = { severity, templateId: kind }
    if (location) attributes.matchedAt = location
    const tags = asStringArray(info.tags)
    if (tags.length) attributes.tags = tags
    const description = asString(info.description)
    if (description) attributes.description = description
    const protocol = asString(row.type)
    if (protocol) attributes.protocol = protocol
    assets.set(vid, { id: vid, type: "vulnerability", label: `${name} [${severity}]`, attributes, status: "pending" })
    // Link the affected asset to the vulnerability so a chain (endpoint --vulnerable_to--> vuln) forms.
    if (matchedAt && /^https?:\/\//.test(matchedAt)) {
      assets.set(endpointId(matchedAt), { id: endpointId(matchedAt), type: "endpoint", label: matchedAt })
      relations.push({ source: endpointId(matchedAt), target: vid, relation: "vulnerable_to", attributes: { severity } })
    } else if (host) {
      assets.set(subdomainId(host), { id: subdomainId(host), type: "subdomain", label: host })
      relations.push({ source: subdomainId(host), target: vid, relation: "vulnerable_to", attributes: { severity } })
    }
  }
  return { assets: [...assets.values()], relations }
}

/** katana `-json` `{endpoint|url}`, or plain URL lines → endpoint assets. */
export const katana = (stdout: string): Parsed => {
  const urls = new Set<string>()
  for (const row of jsonl(stdout)) {
    const url = asString(row.endpoint) ?? asString(row.url) ?? asString((row.request as Record<string, unknown>)?.endpoint)
    if (url) urls.add(url)
  }
  for (const line of lines(stdout)) if (/^https?:\/\//.test(line)) urls.add(line)
  return { assets: [...urls].map((url) => ({ id: endpointId(url), type: "endpoint", label: url })), relations: [] }
}

/** gau / waybackurls: plain URL lines → endpoint assets (historical, may be dead). */
export const urlList = (stdout: string): Parsed => {
  const urls = new Set<string>()
  for (const line of lines(stdout)) if (/^https?:\/\//.test(line)) urls.add(line)
  return { assets: [...urls].map((url) => ({ id: endpointId(url), type: "endpoint", label: url, attributes: { source: "archive" } })), relations: [] }
}

const ffufResult = (r: Record<string, unknown>): Asset | undefined => {
  const url = asString(r.url)
  if (!url) return undefined
  const attributes: Record<string, unknown> = { source: "content-discovery" }
  if (r.status !== undefined) attributes.status = r.status
  if (r.length !== undefined) attributes.length = r.length
  return { id: endpointId(url), type: "endpoint", label: url, attributes }
}

/**
 * ffuf → endpoint assets. Handles both output shapes: `-json` emits one JSONL result row per hit
 * (`{url, status, length}`), while `-of json` writes a wrapper object `{results:[…]}`.
 */
export const ffuf = (stdout: string): Parsed => {
  const assets: Asset[] = []
  for (const row of jsonl(stdout)) {
    if (Array.isArray(row.results)) {
      for (const r of row.results as Array<Record<string, unknown>>) {
        const asset = ffufResult(r)
        if (asset) assets.push(asset)
      }
    } else {
      // A bare JSONL row is itself a result.
      const asset = ffufResult(row)
      if (asset) assets.push(asset)
    }
  }
  return { assets, relations: [] }
}

/** OpenAPI / Swagger document → one endpoint asset per path + method. */
export const openapi = (stdout: string): Parsed => {
  let doc: Record<string, unknown>
  try {
    doc = JSON.parse(stdout)
  } catch {
    return empty
  }
  const base = (() => {
    const servers = doc.servers
    if (Array.isArray(servers) && servers[0] && typeof servers[0] === "object") return asString((servers[0] as Record<string, unknown>).url) ?? ""
    const host = asString(doc.host)
    return host ? `${asStringArray(doc.schemes)[0] ?? "https"}://${host}${asString(doc.basePath) ?? ""}` : ""
  })()
  const paths = doc.paths
  if (!paths || typeof paths !== "object") return empty
  const methods = new Set(["get", "post", "put", "patch", "delete", "options", "head"])
  const assets: Asset[] = []
  for (const [path, item] of Object.entries(paths as Record<string, unknown>)) {
    if (!item || typeof item !== "object") continue
    for (const method of Object.keys(item as Record<string, unknown>)) {
      if (!methods.has(method.toLowerCase())) continue
      const url = `${base}${path}`
      assets.push({
        id: endpointId(`${method.toUpperCase()} ${url}`),
        type: "endpoint",
        label: `${method.toUpperCase()} ${url}`,
        attributes: { method: method.toUpperCase(), path, source: "api-spec" },
      })
    }
  }
  return { assets, relations: [] }
}

/** arjun `-oJ`: `{ "<url>": { method, params:[…] } }` → endpoints enriched with discovered params. */
export const arjun = (stdout: string): Parsed => {
  let doc: Record<string, unknown>
  try {
    doc = JSON.parse(stdout)
  } catch {
    return empty
  }
  const assets: Asset[] = []
  for (const [url, info] of Object.entries(doc)) {
    if (!info || typeof info !== "object") continue
    const params = asStringArray((info as Record<string, unknown>).params)
    if (params.length === 0) continue
    const attributes: Record<string, unknown> = { params }
    const method = asString((info as Record<string, unknown>).method)
    if (method) attributes.method = method
    assets.push({ id: endpointId(url), type: "endpoint", label: url, attributes })
  }
  return { assets, relations: [] }
}

// Endpoint-ish strings and common secret patterns extracted from JavaScript source.
const JS_ENDPOINT = /["'`](\/[a-zA-Z0-9_?&=/.-]{2,}|https?:\/\/[^"'`\s]+)["'`]/g
const JS_SECRETS: ReadonlyArray<readonly [string, RegExp]> = [
  ["aws-access-key", /AKIA[0-9A-Z]{16}/g],
  ["google-api-key", /AIza[0-9A-Za-z_-]{35}/g],
  ["slack-token", /xox[baprs]-[0-9A-Za-z-]{10,}/g],
  ["jwt", /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g],
  ["private-key", /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g],
]

/** Extract endpoints and leaked secrets from JavaScript source (the modern web's real API surface). */
export const javascript = (source: string): Parsed => {
  const endpoints = new Set<string>()
  for (const match of source.matchAll(JS_ENDPOINT)) {
    const value = match[1]
    // Skip trivial/asset paths that add noise rather than surface.
    if (value.length <= 3 || /\.(png|jpe?g|gif|svg|css|woff2?|ico)$/i.test(value)) continue
    endpoints.add(value)
  }
  const secrets: Asset[] = []
  for (const [kind, pattern] of JS_SECRETS)
    for (const match of source.matchAll(pattern))
      secrets.push({
        id: credentialId(match[0]),
        type: "credential",
        label: `${kind} in JavaScript`,
        attributes: { kind, value: match[0] },
      })
  return merge(
    { assets: [...endpoints].map((url) => ({ id: endpointId(url), type: "endpoint", label: url, attributes: { source: "javascript" } })), relations: [] },
    { assets: secrets, relations: [] },
  )
}
