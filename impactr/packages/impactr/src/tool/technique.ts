import { Duration, Effect, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import * as Tool from "./tool"
import { AppProcess } from "@impactr-ai/core/process"
import { AttackGraph } from "@impactr-ai/core/attack-graph/graph"
import { KnowledgeSaturation } from "@impactr-ai/core/session/saturation"
import { TechniqueParse } from "@impactr-ai/core/technique/parse"
import { TechniqueIngest } from "@impactr-ai/core/technique/ingest"
import type { Parsed } from "@impactr-ai/core/technique/asset"
import { InstanceState } from "@/effect/instance-state"
import { Session } from "@/session/session"
import { engagementRoot } from "./engagement-session"

/**
 * The technique tools — Impactr's "hands" in the CLI. Each wraps a proven engine, parses its output
 * with the shared core parsers, and ingests the normalized assets into the SAME session-scoped
 * Attack Graph the agent queries via attack_graph — so technique results and the agent's view stay
 * consistent. The engine shell-out is graceful (a missing binary yields an advisory message).
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

export const techniqueSpecs: ReadonlyArray<Spec> = [
  { name: "enumerate_subdomains", engine: "subfinder", description: "Enumerate subdomains of a root domain (passive + active). Target: a domain.", buildArgs: (t) => ["-silent", "-json", "-d", t], parse: TechniqueParse.subfinder },
  { name: "resolve_dns", engine: "dnsx", description: "Resolve a host's DNS records (A/AAAA/CNAME). Target: a hostname.", buildArgs: (t) => ["-silent", "-json", "-a", "-aaaa", "-cname", "-d", t], parse: TechniqueParse.dnsx },
  { name: "scan_ports", engine: "naabu", description: "Discover open ports and services on a host. Target: a host or IP.", buildArgs: (t) => ["-silent", "-json", "-host", t], parse: TechniqueParse.naabu },
  { name: "probe_http", engine: "httpx", description: "Probe HTTP(S): liveness, status, title, tech, server. Target: a host or URL. First hand for a web target.", buildArgs: (t) => ["-silent", "-json", "-title", "-tech-detect", "-status-code", "-web-server", "-u", t], parse: TechniqueParse.httpx },
  { name: "crawl_site", engine: "katana", description: "Actively crawl a live site for reachable endpoints. Target: a URL.", buildArgs: (t) => ["-silent", "-json", "-u", t], parse: TechniqueParse.katana },
  { name: "harvest_urls", engine: "gau", description: "Collect historical URLs from archives (endpoints linked once). Target: a domain.", buildArgs: (t) => [t], parse: TechniqueParse.urlList },
  { name: "discover_content", engine: "ffuf", description: "Brute-force unlinked content (backups, admin, .git). Target: a base URL (FUZZ is appended).", buildArgs: (t) => ["-s", "-json", "-w", "/usr/share/seclists/Discovery/Web-Content/common.txt", "-u", `${t.replace(/\/$/, "")}/FUZZ`], parse: TechniqueParse.ffuf },
  { name: "discover_api_spec", engine: "curl", description: "Fetch and parse an OpenAPI/Swagger spec into per-operation endpoints. Target: the spec URL.", buildArgs: (t) => ["-s", "-L", "--max-time", "30", t], parse: TechniqueParse.openapi },
  { name: "analyze_javascript", engine: "curl", description: "Fetch a JavaScript file and extract hidden endpoints and leaked secrets. Target: the .js URL.", buildArgs: (t) => ["-s", "-L", "--max-time", "30", t], parse: TechniqueParse.javascript },
  { name: "mine_parameters", engine: "arjun", description: "Discover hidden request parameters on an endpoint, enriching it in the graph. Target: a URL.", buildArgs: (t) => ["-u", t, "-oJ", "/dev/stdout", "-q"], parse: TechniqueParse.arjun },
]

const Parameters = Schema.Struct({
  target: Schema.String.annotate({ description: "The target for this technique (domain, host, URL, or spec/JS URL — see the tool description)." }),
})

export const makeTechnique = (spec: Spec) =>
  Tool.define(
    spec.name,
    Effect.gen(function* () {
      const graph = yield* AttackGraph
      const saturation = yield* KnowledgeSaturation
      const appProcess = yield* AppProcess.Service
      const sessions = yield* Session.Service
      return {
        description: spec.description,
        parameters: Parameters,
        execute: ({ target }: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
          Effect.gen(function* () {
            const sid = yield* engagementRoot(sessions, ctx.sessionID as string)
            const instanceCtx = yield* InstanceState.context
            const command = ChildProcess.make(spec.engine, [...spec.buildArgs(target)], {
              cwd: instanceCtx.directory,
              stdin: "ignore",
              detached: process.platform !== "win32",
              forceKillAfter: Duration.seconds(3),
            })
            const result = yield* appProcess
              .run(command, { combineOutput: true, timeout: ENGINE_TIMEOUT, maxOutputBytes: MAX_CAPTURE_BYTES })
              .pipe(Effect.catchTag("AppProcessError", () => Effect.succeed(undefined)))
            if (!result)
              return `Could not run '${spec.engine}' (missing from PATH, or it timed out). Install it or run the equivalent via shell, then record results with attack_graph.`
            const stdout = result.output?.toString("utf8") ?? ""
            const parsed = spec.parse(stdout)
            const ingested = yield* TechniqueIngest.ingest(graph, sid, parsed)
            // New assets are genuine discovery progress — keep the engine working while techniques
            // are productive rather than winding down because findings weren't recorded manually.
            if (ingested.created > 0) yield* saturation.recordFinding(sid)
            return ingested.digest
          }).pipe(
            Effect.catch((e: unknown) => Effect.succeed(`Error: ${e instanceof Error ? e.message : String(e)}`)),
            Effect.map((output) => ({ title: spec.name, metadata: {}, output })),
          ),
      }
    }),
  )
