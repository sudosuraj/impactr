import { describe, expect, test } from "bun:test"
import { findChains, renderChains } from "../src/tool/attack-chains"
import type { GraphState, Node } from "@impactr-ai/core/attack-graph/schema"

const node = (over: { id: string; type: Node["type"]; label: string; status?: Node["status"]; severity?: string }): Node => ({
  id: over.id,
  type: over.type,
  label: over.label,
  attributes: over.severity ? { severity: over.severity } : {},
  status: over.status ?? "pending",
  discoveredAt: 0,
  loopCount: 0,
})

describe("findChains", () => {
  test("surfaces a composed path ending on a vulnerability, ranked by severity", () => {
    const graph: GraphState = {
      nodes: {
        "subdomain:api.acme.com": node({ id: "subdomain:api.acme.com", type: "subdomain", label: "api.acme.com" }),
        "endpoint:/login": node({ id: "endpoint:/login", type: "endpoint", label: "/login" }),
        "vuln:sqli": node({ id: "vuln:sqli", type: "vulnerability", label: "SQL injection", severity: "critical" }),
      },
      edges: [
        { source: "subdomain:api.acme.com", target: "endpoint:/login", relation: "exposes", attributes: {} },
        { source: "endpoint:/login", target: "vuln:sqli", relation: "vulnerable_to", attributes: { severity: "critical" } },
      ],
    }

    // Every node with an outgoing edge is a walk start, so the 2-step subchain from
    // endpoint:/login is also surfaced alongside the full 3-step chain — ranked below it,
    // since score favors the longer composition at equal severity.
    const chains = findChains(graph)
    expect(chains).toHaveLength(2)
    expect(chains[0]?.severity).toBe("critical")
    expect(chains[0]?.steps.map((s) => s.id)).toEqual(["subdomain:api.acme.com", "endpoint:/login", "vuln:sqli"])

    const rendered = renderChains(chains)
    expect(rendered).toContain("[critical]")
    expect(rendered).toContain("api.acme.com --exposes--> /login --vulnerable_to--> SQL injection")
  })

  test("does not surface a chain shorter than two steps or with no impact node", () => {
    const graph: GraphState = {
      nodes: {
        "subdomain:a": node({ id: "subdomain:a", type: "subdomain", label: "a" }),
        "endpoint:b": node({ id: "endpoint:b", type: "endpoint", label: "b" }),
      },
      edges: [{ source: "subdomain:a", target: "endpoint:b", relation: "exposes", attributes: {} }],
    }

    expect(findChains(graph)).toHaveLength(0)
  })

  test("renderChains reports the empty state distinctly from a real chain list", () => {
    expect(renderChains([])).toContain("No exploit chains found yet")
  })
})
