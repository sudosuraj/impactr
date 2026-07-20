import { describe, expect, test } from "bun:test"
import { AsmAssetClassify } from "@impactr-ai/core/asm-asset/classify"

describe("AsmAssetClassify.classifyToken", () => {
  test("classifies an apex domain as domain with itself as root", () => {
    expect(AsmAssetClassify.classifyToken("acme.com")).toEqual({ type: "domain", value: "acme.com", root: "acme.com" })
  })

  test("classifies a three-label host as a subdomain with its registrable root", () => {
    expect(AsmAssetClassify.classifyToken("api.acme.com")).toEqual({
      type: "subdomain",
      value: "api.acme.com",
      root: "acme.com",
    })
  })

  test("classifies a wildcard as its root domain", () => {
    expect(AsmAssetClassify.classifyToken("*.acme.com")).toEqual({
      type: "wildcard",
      value: "acme.com",
      root: "acme.com",
    })
  })

  test("classifies IPv4 and rejects out-of-range octets", () => {
    expect(AsmAssetClassify.classifyToken("10.0.0.1")).toEqual({ type: "ip", value: "10.0.0.1" })
    expect(AsmAssetClassify.classifyToken("999.1.1.1")).toBeUndefined()
  })

  test("classifies a CIDR range", () => {
    expect(AsmAssetClassify.classifyToken("10.0.0.0/24")).toEqual({ type: "cidr", value: "10.0.0.0/24" })
  })

  test("classifies a URL and normalizes it to origin + path", () => {
    expect(AsmAssetClassify.classifyToken("https://app.acme.com/login")).toEqual({
      type: "url",
      value: "https://app.acme.com/login",
      root: "acme.com",
    })
  })

  test("classifies a URL with a bare IP host without a nonsensical root", () => {
    expect(AsmAssetClassify.classifyToken("https://10.0.0.1/admin")).toEqual({
      type: "url",
      value: "https://10.0.0.1/admin",
    })
    expect(AsmAssetClassify.classifyToken("https://[::1]:8443/")).toEqual({
      type: "url",
      value: "https://[::1]:8443",
    })
  })

  test("lower-cases hostnames and strips a trailing dot", () => {
    expect(AsmAssetClassify.classifyToken("API.Acme.COM.")).toEqual({
      type: "subdomain",
      value: "api.acme.com",
      root: "acme.com",
    })
  })

  test("rejects noise that is not a target", () => {
    expect(AsmAssetClassify.classifyToken("not a target")).toBeUndefined()
    expect(AsmAssetClassify.classifyToken("")).toBeUndefined()
  })
})

describe("AsmAssetClassify.classifyScope", () => {
  test("splits on commas and whitespace and dedupes", () => {
    const assets = AsmAssetClassify.classifyScope("*.acme.com, 10.0.0.0/24  api.acme.com, api.acme.com")
    expect(assets).toEqual([
      { type: "wildcard", value: "acme.com", root: "acme.com" },
      { type: "cidr", value: "10.0.0.0/24" },
      { type: "subdomain", value: "api.acme.com", root: "acme.com" },
    ])
  })

  test("returns empty for a scope with nothing classifiable", () => {
    expect(AsmAssetClassify.classifyScope("internal systems only")).toEqual([])
  })
})

describe("AsmAssetClassify.recommendPlaybook", () => {
  test("picks web-app when any web-facing seed is present", () => {
    expect(AsmAssetClassify.recommendPlaybook(AsmAssetClassify.classifyScope("acme.com, 10.0.0.0/24"))).toBe("web-app")
  })

  test("picks external-network for purely network seeds", () => {
    expect(AsmAssetClassify.recommendPlaybook(AsmAssetClassify.classifyScope("10.0.0.0/24, 10.0.1.5"))).toBe(
      "external-network",
    )
  })

  test("recommends nothing for an empty seed set", () => {
    expect(AsmAssetClassify.recommendPlaybook([])).toBeUndefined()
  })
})

describe("AsmAssetClassify.renderKickoff", () => {
  test("renders per-asset first moves, a credential-leak step, and a playbook", () => {
    const kickoff = AsmAssetClassify.renderKickoff(AsmAssetClassify.classifyScope("*.acme.com, 10.0.0.5"))
    expect(kickoff).toContain("wildcard: acme.com → enumerate_subdomains")
    expect(kickoff).toContain("ip: 10.0.0.5 → scan_ports")
    expect(kickoff).toContain("credential-leak OSINT")
    expect(kickoff).toContain("leaked credentials on acme.com")
    expect(kickoff).toContain('attack_plan(action:"seed", playbook:"web-app")')
  })

  test("is empty when nothing was classifiable", () => {
    expect(AsmAssetClassify.renderKickoff([])).toBe("")
  })
})
