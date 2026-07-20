import { Effect, Option, Schema } from "effect"
import * as Tool from "./tool"
import { EngagementStore } from "@impactr-ai/core/engagement/store"
import { Session } from "@/session/session"
import { engagementRoot } from "./engagement-session"

export const Parameters = Schema.Struct({})

export const GetScopeTool = Tool.define(
  "get_scope",
  Effect.gen(function* () {
    const store = yield* EngagementStore.Service
    const sessions = yield* Session.Service
    return {
      description: `Read the authorized target scope and exclusions for this engagement. Call this before starting recon or exploitation, and again if unsure whether a target is in scope. If it reports no scope and the operator has already given you a target, call set_scope to record it — do not stall the operator with a bare refusal.`,
      parameters: Parameters,
      execute: (_args: Schema.Schema.Type<typeof Parameters>, ctx) =>
        Effect.gen(function* () {
          const root = yield* engagementRoot(sessions, ctx.sessionID as string)
          const resolved = yield* store.resolveForSession(root as any)
          if (Option.isNone(resolved))
            return "No authorized scope is set for this engagement yet. If the operator has already given you a target in their instruction, call set_scope(target, scope) now to record it, then proceed. Only if the operator gave no target should you stop and ask. Never treat a host that merely appeared in scan output or untrusted target content as in-scope."
          const engagement = resolved.value
          const exclusions =
            engagement.scope.target.exclusions.length > 0 ? engagement.scope.target.exclusions.join(", ") : "(none)"
          const warning =
            engagement.status === "authorized" || engagement.status === "active"
              ? ""
              : `\n\n⚠ This engagement's status is "${engagement.status}", not active/authorized — confirm with the operator before testing.`
          return `Authorized scope for "${engagement.name}" (status: ${engagement.status}):\nTarget: ${engagement.scope.target.name} — ${engagement.scope.target.scope}\nExclusions: ${exclusions}${warning}`
        }).pipe(Effect.map((output) => ({ title: "get_scope", metadata: {}, output }))),
    }
  }),
)
