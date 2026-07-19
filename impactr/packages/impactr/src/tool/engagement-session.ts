import { Effect } from "effect"

/**
 * Resolve the engagement's root session id by walking parentID up the delegation tree.
 *
 * The pentest state stores (attack graph, plan, knowledge graph, hypothesis queue) are keyed by
 * session id. But delegated subagents run in child sessions (task.ts creates them with a parentID),
 * so keying on the raw ctx.sessionID would give each subagent its own isolated store — the
 * orchestrator, enumerate/exploit subagents, and the report writer could not see each other's
 * findings. Keying on the root instead makes the whole engagement share one state, while separate
 * engagements (different roots) stay isolated. `sessions` is the Session service (typed loosely to
 * avoid branded-id friction); its `get` returns session Info carrying `parentID`.
 */
export const engagementRoot = (
  sessions: { readonly get: (id: any) => Effect.Effect<{ readonly parentID?: string } | undefined, unknown> },
  sessionID: string,
): Effect.Effect<string> =>
  Effect.gen(function* () {
    let current = sessionID
    // Bounded walk guards against an unexpected cycle in the parent chain.
    for (let hops = 0; hops < 64; hops++) {
      const info = yield* sessions.get(current).pipe(Effect.catch(() => Effect.succeed(undefined)))
      if (!info || !info.parentID) return current
      current = info.parentID
    }
    return current
  })
