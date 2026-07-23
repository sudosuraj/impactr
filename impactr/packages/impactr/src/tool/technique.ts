import { Duration, Effect, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import * as Tool from "./tool"
import { AppProcess } from "@impactr-ai/core/process"
import { AttackGraph } from "@impactr-ai/core/attack-graph/graph"
import { KnowledgeSaturation } from "@impactr-ai/core/session/saturation"
import { TechniqueIngest } from "@impactr-ai/core/technique/ingest"
import { techniqueSpecs, type Spec } from "@impactr-ai/core/technique/specs"
import { InstanceState } from "@/effect/instance-state"
import { Session } from "@/session/session"
import { engagementRoot } from "./engagement-session"

/**
 * The technique tools — Impactr's "hands" in the CLI. Each wraps a proven engine, parses its output
 * with the shared core parsers, and ingests the normalized assets into the SAME session-scoped
 * Attack Graph the agent queries via attack_graph — so technique results and the agent's view stay
 * consistent. The spec list (which engines exist, their args) lives in core/technique/specs so the
 * hosted tool wrapper can't drift onto a different set of techniques. The engine shell-out is
 * graceful (a missing binary yields an advisory message).
 */

const MAX_CAPTURE_BYTES = 5 * 1024 * 1024
const ENGINE_TIMEOUT = Duration.minutes(5)

export { techniqueSpecs }

const Parameters = Schema.Struct({
  target: Schema.String.annotate({ description: "The target for this technique (domain, host, URL, or spec/JS URL — see the tool description)." }),
  wordlist: Schema.optional(Schema.Literals(["common", "medium", "big", "raft"])).annotate({ description: "discover_content only: content wordlist size (default 'common')." }),
  extensions: Schema.optional(Schema.String).annotate({ description: "discover_content only: comma-separated extensions to append, e.g. '.bak,.old,.zip,.git'." }),
  ports: Schema.optional(Schema.String).annotate({ description: "scan_ports only: 'top-100' (default), 'top-1000', 'full', or a list like '80,443,8080'." }),
  depth: Schema.optional(Schema.Number).annotate({ description: "crawl_site only: crawl depth." }),
  severity: Schema.optional(Schema.String).annotate({ description: "scan_vulnerabilities only: severities to scan, e.g. 'critical,high' (default 'critical,high,medium')." }),
  tags: Schema.optional(Schema.String).annotate({ description: "scan_vulnerabilities only: nuclei template tags, e.g. 'cve,rce,exposure'." }),
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
        execute: (args: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
          Effect.gen(function* () {
            const { target } = args
            const sid = yield* engagementRoot(sessions, ctx.sessionID as string)
            const instanceCtx = yield* InstanceState.context
            const command = ChildProcess.make(spec.engine, [...spec.buildArgs(target, args)], {
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
