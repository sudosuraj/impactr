import { describe, expect, test } from "bun:test"
import { EngagementStore } from "@impactr-ai/core/engagement/store"
import { EngagementSchema } from "@impactr-ai/core/engagement/schema"

const eng = (over: {
  id: string
  status: EngagementSchema.Status
  directory: string | null
  target: string
  scope: string
  exclusions?: string[]
}): EngagementStore.LocalEngagement => ({
  id: over.id as EngagementSchema.ID,
  name: over.target,
  status: over.status,
  directory: over.directory,
  scope: { target: { name: over.target, scope: over.scope, exclusions: over.exclusions ?? [] } },
})

describe("EngagementStore.findReusable", () => {
  const dir = "/work/acme"

  test("reuses an authorized engagement matching directory + target + scope", () => {
    const list = [eng({ id: "eng_1", status: "authorized", directory: dir, target: "acme.com", scope: "*.acme.com" })]
    const found = EngagementStore.findReusable(list, { directory: dir, target: "acme.com", scope: "*.acme.com" })
    expect(found?.id).toBe("eng_1" as EngagementSchema.ID)
  })

  test("reuses an active engagement too", () => {
    const list = [eng({ id: "eng_a", status: "active", directory: dir, target: "acme.com", scope: "acme.com" })]
    expect(EngagementStore.findReusable(list, { directory: dir, target: "acme.com", scope: "acme.com" })?.id).toBe(
      "eng_a" as EngagementSchema.ID,
    )
  })

  test("does not reuse a revoked or completed engagement", () => {
    const list = [
      eng({ id: "eng_r", status: "revoked", directory: dir, target: "acme.com", scope: "acme.com" }),
      eng({ id: "eng_c", status: "completed", directory: dir, target: "acme.com", scope: "acme.com" }),
    ]
    expect(EngagementStore.findReusable(list, { directory: dir, target: "acme.com", scope: "acme.com" })).toBeUndefined()
  })

  test("does not reuse across a different directory or scope", () => {
    const list = [eng({ id: "eng_1", status: "authorized", directory: dir, target: "acme.com", scope: "*.acme.com" })]
    expect(EngagementStore.findReusable(list, { directory: "/other", target: "acme.com", scope: "*.acme.com" })).toBeUndefined()
    expect(EngagementStore.findReusable(list, { directory: dir, target: "acme.com", scope: "acme.com" })).toBeUndefined()
  })

  test("does not reuse when the requested exclusions differ from the stored ones", () => {
    const list = [
      eng({ id: "eng_1", status: "authorized", directory: dir, target: "acme.com", scope: "*.acme.com", exclusions: [] }),
    ]
    expect(
      EngagementStore.findReusable(list, { directory: dir, target: "acme.com", scope: "*.acme.com", exclusions: ["dev.acme.com"] }),
    ).toBeUndefined()
  })

  test("reuses when the requested exclusions match the stored ones regardless of order", () => {
    const list = [
      eng({
        id: "eng_1",
        status: "authorized",
        directory: dir,
        target: "acme.com",
        scope: "*.acme.com",
        exclusions: ["b.acme.com", "a.acme.com"],
      }),
    ]
    expect(
      EngagementStore.findReusable(list, {
        directory: dir,
        target: "acme.com",
        scope: "*.acme.com",
        exclusions: ["a.acme.com", "b.acme.com"],
      })?.id,
    ).toBe("eng_1" as EngagementSchema.ID)
  })
})
