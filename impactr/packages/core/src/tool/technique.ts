export * as TechniqueTools from "./technique"

import { ToolFailure } from "@impactr-ai/llm"
import { Duration, Effect, Layer, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { makeLocationNode } from "../effect/app-node"
import { AttackGraph, node as AttackGraphNode } from "../attack-graph/graph"
import { KnowledgeSaturation, node as KnowledgeSaturationNode } from "../session/saturation"
import { Location } from "../location"
import { PermissionV2 } from "../permission"
import { AppProcess } from "../process"
import { TechniqueIngest } from "../technique/ingest"
import { techniqueSpecs } from "../technique/specs"
import { ToolRegistry } from "./registry"
import { Tool } from "./tool"
import { Tools } from "./tools"

/**
 * The technique tools — Impactr's "hands". Each wraps a proven engine (subfinder, httpx, …) behind
 * one shared scaffold: assert scope, run the engine, parse its output into normalized assets, and
 * upsert them into the Attack Graph, returning a compact digest. The agent reasons over structured
 * graph state, not raw tool transcripts — which also means these tools are injection-safe by
 * construction: target bytes become typed nodes, never free text echoed back into context.
 *
 * The spec list (technique/specs.ts) is the single source of truth for which techniques exist and
 * what arguments they build, shared with the CLI tool wrapper so the two can't drift onto different
 * sets of techniques. The engine shell-out is graceful: a missing binary yields an advisory digest,
 * not a crash.
 */

const MAX_CAPTURE_BYTES = 5 * 1024 * 1024
const ENGINE_TIMEOUT = Duration.minutes(5)

export const Input = Schema.Struct({
  target: Schema.String.annotate({ description: "The target for this technique (domain, host, URL, or spec/JS URL — see the tool description)." }),
  wordlist: Schema.Literals(["common", "medium", "big", "raft"]).pipe(Schema.optional).annotate({
    description: "discover_content only: content wordlist size (default 'common').",
  }),
  extensions: Schema.String.pipe(Schema.optional).annotate({
    description: "discover_content only: comma-separated extensions to append, e.g. '.bak,.old,.zip,.git'.",
  }),
  ports: Schema.String.pipe(Schema.optional).annotate({
    description: "scan_ports only: 'top-100' (default), 'top-1000', 'full', or a list like '80,443,8080'.",
  }),
  depth: Schema.Number.pipe(Schema.optional).annotate({ description: "crawl_site only: crawl depth." }),
  severity: Schema.String.pipe(Schema.optional).annotate({
    description: "scan_vulnerabilities only: severities to scan, e.g. 'critical,high' (default 'critical,high,medium').",
  }),
  tags: Schema.String.pipe(Schema.optional).annotate({
    description: "scan_vulnerabilities only: nuclei template tags, e.g. 'cve,rce,exposure'.",
  }),
})

export const Output = Schema.Struct({
  tool: Schema.String,
  summary: Schema.String,
})
export type Output = typeof Output.Type

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools.Service
    const graph = yield* AttackGraph
    const appProcess = yield* AppProcess.Service
    const permission = yield* PermissionV2.Service
    const location = yield* Location.Service
    const saturation = yield* KnowledgeSaturation

    for (const spec of techniqueSpecs)
      yield* tools
        .register({
          [spec.name]: Tool.make({
            description: spec.description,
            input: Input,
            output: Output,
            toModelOutput: ({ output }) => [{ type: "text", text: output.summary }],
            execute: (input, context) =>
              permission
                .assert({
                  action: "technique",
                  resources: ["*"],
                  sessionID: context.sessionID,
                  agent: context.agent,
                  source: { type: "tool", messageID: context.assistantMessageID, callID: context.toolCallID },
                })
                .pipe(
                  Effect.mapError(() => new ToolFailure({ message: `Permission denied: ${spec.name}` })),
                  Effect.andThen(
                    Effect.gen(function* () {
                      const command = ChildProcess.make(spec.engine, [...spec.buildArgs(input.target, input)], {
                        cwd: location.directory,
                        stdin: "ignore",
                        detached: process.platform !== "win32",
                        forceKillAfter: Duration.seconds(3),
                      })
                      const result = yield* appProcess
                        .run(command, { combineOutput: true, timeout: ENGINE_TIMEOUT, maxOutputBytes: MAX_CAPTURE_BYTES })
                        .pipe(Effect.catchTag("AppProcessError", () => Effect.succeed(undefined)))
                      if (!result)
                        return {
                          tool: spec.name,
                          summary: `Could not run '${spec.engine}' (missing from PATH, or it timed out). Install it or run the equivalent via bash, then record results with attack_graph.`,
                        }
                      const stdout = result.output?.toString("utf8") ?? ""
                      const parsed = spec.parse(stdout)
                      const ingested = yield* TechniqueIngest.ingest(graph, context.sessionID, parsed)
                      // New assets are genuine discovery progress. Feed the saturation signal so the
                      // Continuous Discovery Engine keeps working while techniques are productive,
                      // instead of winding down just because findings weren't recorded via record_discovery.
                      if (ingested.created > 0) yield* saturation.recordFinding(context.sessionID).pipe(Effect.orDie)
                      return { tool: spec.name, summary: ingested.digest }
                    }),
                  ),
                ),
          }),
        })
        .pipe(Effect.orDie)
  }),
)

export const node = makeLocationNode({
  name: "tool/technique",
  layer,
  deps: [ToolRegistry.node, PermissionV2.node, AttackGraphNode, KnowledgeSaturationNode, AppProcess.node, Location.node],
})
