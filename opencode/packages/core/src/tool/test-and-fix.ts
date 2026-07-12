export * as TestAndFixTool from "./test-and-fix"

import path from "path"
import { ToolFailure } from "@impactr-ai/llm"
import { Duration, Effect, Layer, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { makeLocationNode } from "../effect/app-node"
import { FSUtil } from "../fs-util"
import { Location } from "../location"
import { AppProcess } from "../process"
import { PermissionV2 } from "../permission"
import { ToolRegistry } from "./registry"
import { Tool } from "./tool"
import { Tools } from "./tools"

export const name = "test_and_fix"

export const Input = Schema.Struct({
  testCommand: Schema.String.pipe(Schema.optional).annotate({
    description: "The test command to execute. If omitted, will auto-detect from package.json scripts.",
  }),
})

export const Output = Schema.Struct({
  command: Schema.String,
  exitCode: Schema.Number,
  output: Schema.String,
  status: Schema.String,
})
export type Output = typeof Output.Type

export const toModelOutput = (output: Output) =>
  `Test Command: ${output.command}\nExit Code: ${output.exitCode}\nStatus: ${output.status}\n\nOutput:\n${output.output}`

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools.Service
    const location = yield* Location.Service
    const fs = yield* FSUtil.Service
    const appProcess = yield* AppProcess.Service
    const permission = yield* PermissionV2.Service

    yield* tools
      .register({
        [name]: Tool.make({
          description:
            "Run project tests to verify recent changes. Auto-detects npm/bun/deno test commands if omitted. Use the output to debug and fix failing tests.",
          input: Input,
          output: Output,
          toModelOutput: ({ output }) => [{ type: "text", text: toModelOutput(output) }],
          execute: (input, context) =>
            Effect.gen(function* () {
              const source = {
                type: "tool" as const,
                messageID: context.assistantMessageID,
                callID: context.toolCallID,
              }

              // Auto-detect test command
              let commandStr = input.testCommand
              if (!commandStr) {
                const packageJsonPath = path.join(location.directory, "package.json")
                 const hasPackageJson = yield* fs.exists(packageJsonPath).pipe(Effect.catch(() => Effect.succeed(false)))
                if (hasPackageJson) {
                  const packageJson = yield* fs.readJson(packageJsonPath).pipe(
                    Effect.map((json) => json as any),
                    Effect.catch(() => Effect.succeed(undefined)),
                  )
                  if (packageJson?.scripts?.test && packageJson.scripts.test !== "echo \"Error: no test specified\" && exit 1") {
                    commandStr = "bun run test" // Default to bun run test since we're a Bun codebase
                    // But check if we should run npm run test
                    const hasBunLock = yield* fs.exists(path.join(location.directory, "bun.lock")).pipe(Effect.catch(() => Effect.succeed(false)))
                    if (!hasBunLock) {
                      const hasPackageLock = yield* fs.exists(path.join(location.directory, "package-lock.json")).pipe(Effect.catch(() => Effect.succeed(false)))
                      commandStr = hasPackageLock ? "npm run test" : "bun run test"
                    }
                  }
                }
              }

              // Fallback
              if (!commandStr) {
                const hasBun = yield* fs.exists(path.join(location.directory, "bun.lock")).pipe(Effect.catch(() => Effect.succeed(false)))
                commandStr = hasBun ? "bun test" : "npm test"
              }

              yield* permission.assert({
                action: name,
                resources: [commandStr],
                save: [commandStr],
                sessionID: context.sessionID,
                agent: context.agent,
                source,
              })

              const command = ChildProcess.make(commandStr, [], {
                cwd: location.directory,
                stdin: "ignore",
                detached: process.platform !== "win32",
                forceKillAfter: Duration.seconds(3),
              })

              const result = yield* appProcess
                .run(command, {
                  combineOutput: true,
                  timeout: Duration.minutes(2),
                  maxOutputBytes: 1024 * 1024,
                })
                .pipe(
                  Effect.catchTag("AppProcessError", (error) => Effect.fail(new ToolFailure({ message: error.message }))),
                )

              const outputStr = result.stdout.toString("utf8") + result.stderr.toString("utf8")
              const status = result.exitCode === 0 ? "PASSED" : "FAILED"

              return {
                command: commandStr,
                exitCode: result.exitCode,
                output: outputStr,
                status,
              }
            }).pipe(
              Effect.mapError((error) =>
                error instanceof ToolFailure
                  ? error
                  : new ToolFailure({ message: error instanceof Error ? error.message : String(error) }),
              ),
            ),
        }),
      })
      .pipe(Effect.orDie)
  }),
)

export const node = makeLocationNode({
  name: "tool/test-and-fix",
  layer,
  deps: [ToolRegistry.node, PermissionV2.node, FSUtil.node, Location.node, AppProcess.node],
})
