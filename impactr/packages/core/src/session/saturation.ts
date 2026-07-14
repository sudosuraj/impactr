import { Context, Effect, Layer, Ref, Clock, Duration } from "effect"

export interface SaturationConfig {
  readonly windowDuration: Duration.Duration // e.g., 1 hour
  readonly minMeaningfulFindings: number // e.g., 5 findings per hour
}

export interface Interface {
  readonly initialize: (config: SaturationConfig) => Effect.Effect<void>
  readonly recordFinding: (sessionId: string) => Effect.Effect<void>
  readonly isSaturated: (sessionId: string) => Effect.Effect<boolean>
  readonly status: (sessionId: string) => Effect.Effect<{
    discoveryRate: number
    saturated: boolean
  }>
}

interface SessionState {
  readonly startedAt: number
  readonly findings: number[] // timestamps, pruned to the active window
}

export class KnowledgeSaturation extends Context.Service<KnowledgeSaturation, Interface>()(
  "@impactr-ai/core/session/saturation",
) {}

export const layer = Layer.effect(
  KnowledgeSaturation,
  Effect.gen(function* () {
    const state = yield* Ref.make({
      config: {
        // Real engagements run for days with long low-yield stretches (fuzzing,
        // slow scans, deep exploitation). Only declare saturation after a genuinely
        // long dry spell so the Continuous Discovery Engine keeps working instead
        // of quitting after the first quiet hour.
        windowDuration: Duration.hours(2),
        minMeaningfulFindings: 2,
      } as SaturationConfig,
      sessions: new Map<string, SessionState>(),
    })

    const prune = (now: number, window: Duration.Duration, findings: number[]) => {
      const cutoff = now - Duration.toMillis(window)
      return findings.filter((t) => t >= cutoff)
    }

    const checkSaturated = (sessionId: string) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        const s = yield* Ref.get(state)
        const session = s.sessions.get(sessionId)
        if (!session || session.findings.length === 0) return false

        const windowMillis = Duration.toMillis(s.config.windowDuration)
        // Not enough history yet: keep exploring until at least one full window has elapsed.
        if (now - session.startedAt < windowMillis) return false

        const recent = prune(now, s.config.windowDuration, session.findings)
        return recent.length < s.config.minMeaningfulFindings
      })

    return KnowledgeSaturation.of({
      initialize: (config: SaturationConfig) => Ref.update(state, (s) => ({ ...s, config })),

      recordFinding: (sessionId: string) =>
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis
          yield* Ref.update(state, (s) => {
            const existing = s.sessions.get(sessionId)
            const startedAt = existing?.startedAt ?? now
            const findings = prune(now, s.config.windowDuration, [...(existing?.findings ?? []), now])
            const sessions = new Map(s.sessions)
            sessions.set(sessionId, { startedAt, findings })
            return { ...s, sessions }
          })
        }),

      isSaturated: (sessionId: string) => checkSaturated(sessionId),

      status: (sessionId: string) =>
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis
          const s = yield* Ref.get(state)
          const session = s.sessions.get(sessionId)
          const recent = session ? prune(now, s.config.windowDuration, session.findings) : []
          const saturated = yield* checkSaturated(sessionId)
          return { discoveryRate: recent.length, saturated }
        }),
    })
  }),
)

import { makeGlobalNode } from "../effect/app-node"
export const node = makeGlobalNode({
  service: KnowledgeSaturation,
  layer,
  deps: [],
})
