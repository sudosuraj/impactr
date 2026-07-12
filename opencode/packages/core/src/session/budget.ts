import { Context, Effect, Layer, Ref } from "effect"

export interface BudgetConfig {
  readonly maxRequests?: number
  readonly maxCost?: number // in USD
  readonly maxTokens?: number
  readonly maxAgentHours?: number
}

export interface Interface {
  readonly initialize: (config: BudgetConfig) => Effect.Effect<void>
  readonly consumeTokens: (tokens: number, costEstimate?: number) => Effect.Effect<void>
  readonly consumeRequest: () => Effect.Effect<void>
  readonly isExhausted: () => Effect.Effect<boolean>
  readonly status: () => Effect.Effect<{
    requests: number
    tokens: number
    cost: number
  }>
}

export class SessionBudget extends Context.Service<SessionBudget, Interface>()("@impactr-ai/core/session/budget") {}

export const layer = Layer.effect(
  SessionBudget,
  Effect.gen(function* () {
    const state = yield* Ref.make({
      config: {} as BudgetConfig,
      requests: 0,
      tokens: 0,
      cost: 0,
    })

    return SessionBudget.of({
      initialize: (config: BudgetConfig) =>
        Ref.update(state, (s) => ({
          ...s,
          config,
        })),
      
      consumeTokens: (tokens: number, costEstimate: number = 0) =>
        Ref.update(state, (s) => ({
          ...s,
          tokens: s.tokens + tokens,
          cost: s.cost + costEstimate,
        })),

      consumeRequest: () =>
        Ref.update(state, (s) => ({
          ...s,
          requests: s.requests + 1,
        })),

      isExhausted: () =>
        Ref.get(state).pipe(
          Effect.map((s) => {
            if (s.config.maxRequests !== undefined && s.requests >= s.config.maxRequests) return true
            if (s.config.maxTokens !== undefined && s.tokens >= s.config.maxTokens) return true
            if (s.config.maxCost !== undefined && s.cost >= s.config.maxCost) return true
            return false
          })
        ),

      status: () =>
        Ref.get(state).pipe(
          Effect.map((s) => ({
            requests: s.requests,
            tokens: s.tokens,
            cost: s.cost,
          }))
        ),
    })
  })
)

import { makeGlobalNode } from "../effect/app-node"
export const node = makeGlobalNode({
  service: SessionBudget,
  layer,
  deps: [],
})
