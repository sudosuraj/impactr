import { Context, Effect, Layer, Ref, Clock, Duration } from "effect"
import { DateTime } from "effect"

export interface SaturationConfig {
  readonly windowDuration: Duration.Duration // e.g., 1 hour
  readonly minMeaningfulFindings: number // e.g., 5 findings per hour
}

export interface Interface {
  readonly initialize: (config: SaturationConfig) => Effect.Effect<void>
  readonly recordFinding: () => Effect.Effect<void>
  readonly isSaturated: () => Effect.Effect<boolean>
  readonly status: () => Effect.Effect<{
    discoveryRate: number
    saturated: boolean
  }>
}

export class KnowledgeSaturation extends Context.Service<KnowledgeSaturation, Interface>()("@impactr-ai/core/session/saturation") {}

export const layer = Layer.effect(
  KnowledgeSaturation,
  Effect.gen(function* () {
    const state = yield* Ref.make({
      config: {
        windowDuration: Duration.hours(1),
        minMeaningfulFindings: 10,
      } as SaturationConfig,
      findings: [] as number[], // timestamps
    })

    const cleanOldFindings = (currentTime: number, window: Duration.Duration, findings: number[]) => {
      const cutoff = currentTime - Duration.toMillis(window)
      return findings.filter(t => t >= cutoff)
    }

    const checkSaturated = Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis
      const s = yield* Ref.get(state)
      
      if (s.findings.length === 0) return false
      
      const windowMillis = Duration.toMillis(s.config.windowDuration)
      const firstFinding = s.findings[0]
      
      if (now - firstFinding < windowMillis) {
         return false
      }

      const recentFindings = cleanOldFindings(now, s.config.windowDuration, s.findings)
      return recentFindings.length < s.config.minMeaningfulFindings
    })

    return KnowledgeSaturation.of({
      initialize: (config: SaturationConfig) =>
        Ref.update(state, (s) => ({
          ...s,
          config,
        })),

      recordFinding: () =>
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis
          yield* Ref.update(state, (s) => ({
            ...s,
            findings: [...s.findings, now],
          }))
        }),

      isSaturated: () => checkSaturated,

      status: () =>
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis
          const s = yield* Ref.get(state)
          const recentFindings = cleanOldFindings(now, s.config.windowDuration, s.findings)
          const saturated = yield* checkSaturated

          return {
            discoveryRate: recentFindings.length,
            saturated
          }
        }),
    })
  })
)

import { makeGlobalNode } from "../effect/app-node"
export const node = makeGlobalNode({
  service: KnowledgeSaturation,
  layer,
  deps: [],
})
