export * as TechniqueAsset from "./asset"

import type { NodeType, NodeStatus, EdgeRelation } from "../attack-graph/schema"

/**
 * The normalized intermediate every technique tool produces. A technique wraps a proven engine
 * (subfinder, httpx, nuclei, …), and its parser turns that engine's raw output into these
 * engine-agnostic assets and relations. Ingestion upserts them into the Attack Graph, so the agent
 * reasons over structured state — not tool transcripts. Keeping this shape identical across every
 * technique is what lets the tools share one normalizer instead of each inventing its own.
 */

export interface Asset {
  /** Stable graph id, e.g. "subdomain:api.example.com", "port:1.2.3.4:443", "endpoint:https://…". */
  readonly id: string
  readonly type: NodeType
  readonly label: string
  readonly attributes?: Record<string, unknown>
  /** Defaults to "pending" on ingest when omitted. */
  readonly status?: NodeStatus
}

export interface Relation {
  readonly source: string
  readonly target: string
  readonly relation: EdgeRelation
  readonly attributes?: Record<string, unknown>
}

export interface Parsed {
  readonly assets: ReadonlyArray<Asset>
  readonly relations: ReadonlyArray<Relation>
}

export const empty: Parsed = { assets: [], relations: [] }

/** Merge several parsed results, so a parser can compose sub-parsers without bookkeeping. */
export const merge = (...parts: ReadonlyArray<Parsed>): Parsed => ({
  assets: parts.flatMap((p) => p.assets),
  relations: parts.flatMap((p) => p.relations),
})

// Stable id builders — one place, so ids stay consistent across techniques and dedupe correctly.
export const subdomainId = (host: string) => `subdomain:${host.toLowerCase()}`
export const ipId = (ip: string) => `ip:${ip}`
export const portId = (host: string, port: number | string) => `port:${host}:${port}`
export const endpointId = (url: string) => `endpoint:${url}`
export const credentialId = (value: string) => `credential:${value}`
