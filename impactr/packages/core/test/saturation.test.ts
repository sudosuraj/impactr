import { describe, expect, test } from "bun:test"
import { Duration, Effect } from "effect"
import { AppNodeBuilder } from "@impactr-ai/core/effect/app-node-builder"
import { KnowledgeSaturation, node as KnowledgeSaturationNode } from "@impactr-ai/core/session/saturation"

const run = <A>(body: Effect.Effect<A, never, KnowledgeSaturation>) =>
  Effect.runPromise(body.pipe(Effect.provide(AppNodeBuilder.build(KnowledgeSaturationNode, []))))

describe("KnowledgeSaturation", () => {
  test("tracks discovery rate independently per session", async () => {
    const result = await run(
      Effect.gen(function* () {
        const saturation = yield* KnowledgeSaturation
        yield* saturation.recordFinding("ses_a")
        yield* saturation.recordFinding("ses_a")
        yield* saturation.recordFinding("ses_a")
        yield* saturation.recordFinding("ses_b")
        return {
          a: yield* saturation.status("ses_a"),
          b: yield* saturation.status("ses_b"),
        }
      }),
    )
    // Findings recorded against one session must not leak into another.
    expect(result.a.discoveryRate).toBe(3)
    expect(result.b.discoveryRate).toBe(1)
  })

  test("is not saturated before a full window has elapsed", async () => {
    const saturated = await run(
      Effect.gen(function* () {
        const saturation = yield* KnowledgeSaturation
        yield* saturation.initialize({ windowDuration: Duration.hours(1), minMeaningfulFindings: 10 })
        // A single finding in a freshly-started session is a low rate, but the
        // engine must keep exploring until at least one full window has passed.
        yield* saturation.recordFinding("ses_new")
        return yield* saturation.isSaturated("ses_new")
      }),
    )
    expect(saturated).toBe(false)
  })

  test("an untouched session reports no discovery and is not saturated", async () => {
    const result = await run(
      Effect.gen(function* () {
        const saturation = yield* KnowledgeSaturation
        return {
          status: yield* saturation.status("ses_empty"),
          saturated: yield* saturation.isSaturated("ses_empty"),
        }
      }),
    )
    expect(result.status.discoveryRate).toBe(0)
    expect(result.saturated).toBe(false)
  })
})
