import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { Permission } from "@/permission"

export const Parameters = Schema.Struct({
  permission: Schema.String.annotate({ description: "The name of the permission, e.g. 'shell', 'read', 'edit', 'mcp'" }),
  pattern: Schema.String.annotate({ description: "The target pattern, e.g. '*' or '/etc/passwd' or 'mcp:db:*'" }),
  reason: Schema.String.annotate({ description: "Why you need this permission." }),
})

export const AskPermissionTool = Tool.define(
  "ask_permission",
  Effect.succeed({
    description: "Ask the user or orchestrator for a specific permission that is currently denied (e.g. read, shell, edit, mcp, external_directory). Use this when your current tool call is blocked by a PermissionDeniedError.",
    parameters: Parameters,
    execute: ({ permission, pattern, reason }, ctx) => Effect.gen(function* () {
      yield* ctx.ask({
        permission,
        patterns: [pattern],
        metadata: { reason },
        always: [],
      })

      return {
        title: `ask_permission: ${permission}`,
        metadata: {},
        output: `Permission '${permission}' for '${pattern}' was requested and successfully granted.`,
      }
    })
  })
)
