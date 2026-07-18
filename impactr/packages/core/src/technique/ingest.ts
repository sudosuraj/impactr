export * as TechniqueIngest from "./ingest"

import { Effect } from "effect"
import type { Edge, Node } from "../attack-graph/schema"
import type { Parsed } from "./asset"

/**
 * Ingest a technique's normalized output into the Attack Graph. Structural `GraphSink` (the real
 * AttackGraph service satisfies it) keeps this decoupled and unit-testable. Nodes upsert with dedup
 * (re-discovery bumps loopCount rather than duplicating), so re-running a technique sharpens the map
 * instead of bloating it. Returns a compact digest — counts by type and new-vs-known — never a dump.
 */
export interface GraphSink {
  readonly addNode: (sessionId: string, node: Omit<Node, "discoveredAt" | "loopCount">) => Effect.Effect<Node>
  readonly addEdge: (sessionId: string, edge: Edge) => Effect.Effect<void>
}

export interface IngestResult {
  readonly assets: number
  readonly created: number
  readonly relations: number
  readonly digest: string
}

export const ingest = (graph: GraphSink, sessionId: string, parsed: Parsed): Effect.Effect<IngestResult> =>
  Effect.gen(function* () {
    // Deduplicate assets by id within this batch first — some parsers emit the same id more than
    // once (e.g. a secret matched twice in one JS file). Without this, the second occurrence would
    // re-discover the just-inserted node and be miscounted as "already known", inflating the digest.
    // Merge attributes so a later occurrence still enriches the node.
    const unique = new Map<string, (typeof parsed.assets)[number]>()
    for (const asset of parsed.assets) {
      const prev = unique.get(asset.id)
      unique.set(asset.id, prev ? { ...asset, attributes: { ...prev.attributes, ...asset.attributes } } : asset)
    }
    const assets = [...unique.values()]

    const byType = new Map<string, number>()
    let created = 0
    for (const asset of assets) {
      const node = yield* graph.addNode(sessionId, {
        id: asset.id,
        type: asset.type,
        label: asset.label,
        attributes: asset.attributes ?? {},
        status: asset.status ?? "pending",
      })
      // A freshly inserted node has loopCount 0; a re-discovery increments it.
      if (node.loopCount === 0) created += 1
      byType.set(asset.type, (byType.get(asset.type) ?? 0) + 1)
    }
    for (const relation of parsed.relations)
      yield* graph.addEdge(sessionId, {
        source: relation.source,
        target: relation.target,
        relation: relation.relation,
        attributes: relation.attributes ?? {},
      })

    const breakdown = [...byType.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => `${count} ${type}`)
      .join(", ")
    const known = assets.length - created
    const digest =
      assets.length === 0
        ? "No assets parsed from the technique output."
        : `Ingested ${assets.length} assets (${breakdown})${
            parsed.relations.length ? `, ${parsed.relations.length} relations` : ""
          } — ${created} new, ${known} already known.`
    return { assets: assets.length, created, relations: parsed.relations.length, digest }
  })
