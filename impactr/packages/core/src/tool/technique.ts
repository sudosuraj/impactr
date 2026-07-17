export * as TechniqueTools from "./technique"

import { ToolFailure } from "@impactr-ai/llm"
import { Duration, Effect, Layer, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { makeLocationNode } from "../effect/app-node"
import { AttackGraph, node as AttackGraphNode } from "../attack-graph/graph"
import { Location } from "../location"
import { PermissionV2 } from "../permission"
import { AppProcess } from "../process"
import { TechniqueParse } from "../technique/parse"
import { TechniqueIngest } from "../technique/ingest"
import type { Parsed } from "../technique/asset"
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
 * The parsers (technique/parse.ts) are the reusable, tested core; a tool is just {engine, argv,
 * parser}. The engine shell-out is graceful: a missing binary yields an advisory digest, not a crash.
 */

const MAX_CAPTURE_BYTES = 5 * 1024 * 1024
const ENGINE_TIMEOUT = Duration.minutes(5)

interface Spec {
  readonly name: string
  readonly engine: string
  readonly description: string
  readonly buildArgs: (target: string) => ReadonlyArray<string>
  readonly parse: (stdout: string) => Parsed
}

// Best-effort invocations of the standard toolkit. Flags are the expected form; the parser is what
// makes the tool correct, and it tolerates both the JSON and plain-text output modes of each engine.
const SPECS: ReadonlyArray<Spec> = [
  {
    name: "enumerate_subdomains",
    engine: "subfinder",
    description: "Enumerate subdomains of a root domain (passive + active). Target: a domain. Results land in the Attack Graph.",
    buildArgs: (t) => ["-silent", "-json", "-d", t],
    parse: TechniqueParse.subfinder,
  },
  {
    name: "resolve_dns",
    engine: "dnsx",
    description: "Resolve a host's DNS records (A/AAAA/CNAME) and map resolutions. Target: a hostname.",
    buildArgs: (t) => ["-silent", "-json", "-a", "-aaaa", "-cname", "-d", t],
    parse: TechniqueParse.dnsx,
  },
  {
    name: "scan_ports",
    engine: "naabu",
    description: "Discover open ports and services on a host. Target: a host or IP.",
    buildArgs: (t) => ["-silent", "-json", "-host", t],
    parse: TechniqueParse.naabu,
  },
  {
    name: "probe_http",
    engine: "httpx",
    description: "Probe HTTP(S): liveness, status, title, tech, server. Target: a host or URL. The first hand to reach for on a web target.",
    buildArgs: (t) => ["-silent", "-json", "-title", "-tech-detect", "-status-code", "-web-server", "-u", t],
    parse: TechniqueParse.httpx,
  },
  {
    name: "crawl_site",
    engine: "katana",
    description: "Actively crawl a live site for reachable endpoints. Target: a URL.",
    buildArgs: (t) => ["-silent", "-json", "-u", t],
    parse: TechniqueParse.katana,
  },
  {
    name: "harvest_urls",
    engine: "gau",
    description: "Collect historical URLs from archives (endpoints that were linked once). Target: a domain.",
    buildArgs: (t) => [t],
    parse: TechniqueParse.urlList,
  },
  {
    name: "discover_content",
    engine: "ffuf",
    description: "Brute-force unlinked content (backups, admin, .git). Target: a base URL (FUZZ is appended).",
    buildArgs: (t) => ["-s", "-json", "-w", "/usr/share/seclists/Discovery/Web-Content/common.txt", "-u", `${t.replace(/\/$/, "")}/FUZZ`],
    parse: TechniqueParse.ffuf,
  },
  {
    name: "discover_api_spec",
    engine: "curl",
    description: "Fetch and parse an OpenAPI/Swagger spec into per-operation endpoints. Target: the spec URL.",
    buildArgs: (t) => ["-s", "-L", "--max-time", "30", t],
    parse: TechniqueParse.openapi,
  },
  {
    name: "analyze_javascript",
    engine: "curl",
    description: "Fetch a JavaScript file and extract hidden endpoints and leaked secrets. Target: the .js URL.",
    buildArgs: (t) => ["-s", "-L", "--max-time", "30", t],
    parse: TechniqueParse.javascript,
  },
]

export const Input = Schema.Struct({
  target: Schema.String.annotate({ description: "The target for this technique (domain, host, URL, or spec/JS URL — see the tool description)." }),
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

    for (const spec of SPECS)
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
                      const command = ChildProcess.make(spec.engine, [...spec.buildArgs(input.target)], {
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
  deps: [ToolRegistry.node, PermissionV2.node, AttackGraphNode, AppProcess.node, Location.node],
})
