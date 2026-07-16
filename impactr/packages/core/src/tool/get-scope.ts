export * as GetScopeTool from "./get-scope"

import { ToolFailure } from "@impactr-ai/llm"
import { Effect, Layer, Option, Schema } from "effect"
import { makeLocationNode } from "../effect/app-node"
import { ToolRegistry } from "./registry"
import { Tool } from "./tool"
import { Tools } from "./tools"
import { HostedContext, node as HostedContextNode } from "../session/hosted-context"
import { HostedEngagement } from "../database/hosted/engagement"
import { EngagementStore } from "../engagement/store"
import { PermissionV2 } from "../permission"

export const name = "get_scope"

export const description =
  "Fetch the authorized target scope and exclusions for this engagement from the tracked authorization record. Call this before starting recon or exploitation, and again if unsure whether a target is in scope."

export const Input = Schema.Struct({})

export const Output = Schema.Struct({
  summary: Schema.String,
})
export type Output = typeof Output.Type

const NOT_ACTIVE_WARNING = (status: string) =>
  `\n\n⚠ This engagement's status is "${status}", not "active" or "authorized" — do not perform any testing until this is resolved with the operator.`

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools.Service
    const hostedContext = yield* HostedContext.Service
    const engagementStore = yield* EngagementStore.Service
    const permission = yield* PermissionV2.Service

    yield* tools
      .register({
        [name]: Tool.make({
          description,
          input: Input,
          output: Output,
          toModelOutput: ({ output }) => [{ type: "text", text: output.summary }],
          execute: (_input, context) =>
            permission
              .assert({
                action: "get_scope",
                resources: ["*"],
                sessionID: context.sessionID,
                agent: context.agent,
                source: { type: "tool", messageID: context.assistantMessageID, callID: context.toolCallID },
              })
              .pipe(
                Effect.mapError(() => new ToolFailure({ message: "Permission denied: get_scope" })),
                Effect.andThen(
                  Effect.gen(function* () {
                    const hosted = yield* hostedContext.resolve(context.sessionID as any)
                    if (Option.isNone(hosted)) {
                      // No hosted engagement — fall back to an engagement the operator
                      // explicitly authorized for this machine (via `impactr engagement
                      // authorize`). This reads a real, persisted, revocable record, not
                      // an ad-hoc file/env var, so it stays a genuine authorization gate.
                      const local = yield* engagementStore.resolveForSession(context.sessionID as any)
                      if (Option.isSome(local)) {
                        const engagement = local.value
                        // resolveForSession only ever returns authorized/active engagements,
                        // so no NOT_ACTIVE_WARNING is needed here (unlike the hosted branch).
                        const target = engagement.scope.target
                        const exclusions =
                          target.exclusions.length > 0 ? target.exclusions.join(", ") : "(none listed)"
                        return {
                          summary: `Authorized scope for "${engagement.name}" (status: ${engagement.status}, operator-authorized local engagement):\nTarget: ${target.name} — ${target.scope}\nExclusions: ${exclusions}`,
                        }
                      }
                      return {
                        summary:
                          "No authorized scope is configured for this session — no tracked hosted engagement and no operator-authorized local engagement. Do not assume any target is in scope; confirm authorization with the operator before proceeding. The operator can authorize a local scope with `impactr engagement authorize --target <t> --scope <s>`.",
                      }
                    }

                    const engagement = yield* HostedEngagement.get(hosted.value.db, hosted.value.engagementID)
                    if (!engagement) {
                      return {
                        summary: `This session's engagement record (${hosted.value.engagementID}) could not be found. Do not proceed until this is resolved.`,
                      }
                    }

                    const target = engagement.scope.target
                    const exclusions =
                      target.exclusions.length > 0 ? target.exclusions.join(", ") : "(none listed)"
                    const warning =
                      engagement.status === "active" || engagement.status === "authorized"
                        ? ""
                        : NOT_ACTIVE_WARNING(engagement.status)

                    return {
                      summary: `Authorized scope for "${engagement.name}" (status: ${engagement.status}):\nTarget: ${target.name} — ${target.scope}\nExclusions: ${exclusions}${warning}`,
                    }
                  }),
                ),
              ),
        }),
      })
      .pipe(Effect.orDie)
  }),
)

export const node = makeLocationNode({
  name: "tool/get-scope",
  layer,
  deps: [ToolRegistry.node, PermissionV2.node, HostedContextNode, EngagementStore.node],
})
