/**
 * Model-facing V2 repo-clone leaf.
 */
export * as RepoCloneTool from "./repo-clone"

import { ToolFailure } from "@impactr-ai/llm"
import { Effect, Layer, Schema } from "effect"
import { makeLocationNode } from "../effect/app-node"
import { LocationMutation } from "../location-mutation"
import { PermissionV2 } from "../permission"
import { ToolRegistry } from "./registry"
import { Tool } from "./tool"
import { Tools } from "./tools"
import { Git } from "../git"
import { AbsolutePath } from "../schema"

export const name = "repo_clone"

export const Input = Schema.Struct({
  remote: Schema.String.annotate({ description: "URL of the remote repository to clone" }),
  directory: Schema.String.annotate({
    description: "Directory path to clone into. Relative paths resolve within the active Location.",
  }),
  branch: Schema.String.pipe(Schema.optional).annotate({ description: "Optional specific branch to clone" }),
  depth: Schema.Number.pipe(Schema.optional).annotate({ description: "Optional commit depth (default is shallow 100)" }),
})

export const Output = Schema.Struct({
  operation: Schema.Literal("repo_clone"),
  remote: Schema.String,
  target: Schema.String,
})
export type Output = typeof Output.Type

export const toModelOutput = (output: Output) =>
  `Successfully cloned ${output.remote} into ${output.target}`

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools.Service
    const mutation = yield* LocationMutation.Service
    const permission = yield* PermissionV2.Service
    const git = yield* Git.Service

    yield* tools
      .register({
        [name]: Tool.withPermission(
          Tool.make({
            description:
              "Clone a git repository to the specified directory. Requires external_directory approval for paths outside the active Location.",
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
                const target = yield* mutation.resolve({ path: input.directory, kind: "directory" })
                const external = target.externalDirectory
                if (external)
                  yield* permission.assert({
                    ...LocationMutation.externalDirectoryPermission(external),
                    sessionID: context.sessionID,
                    agent: context.agent,
                    source,
                  })
                
                yield* permission.assert({
                  action: "edit",
                  resources: [target.resource],
                  save: ["*"],
                  sessionID: context.sessionID,
                  agent: context.agent,
                  source,
                })

                yield* git.repo.clone({
                  remote: input.remote,
                  directory: AbsolutePath.make(target.canonical),
                  branch: input.branch,
                  depth: input.depth,
                })
                
                return {
                  operation: "repo_clone" as const,
                  remote: input.remote,
                  target: target.resource,
                }
              }).pipe(Effect.mapError((cause) => new ToolFailure({ message: `Unable to clone repository ${input.remote}: ${cause.message}` }))),
          }),
          "edit",
        ),
      })
      .pipe(Effect.orDie)
  }),
)

export const node = makeLocationNode({
  name: "tool/repo-clone",
  layer,
  deps: [ToolRegistry.node, LocationMutation.node, PermissionV2.node, Git.node],
})
