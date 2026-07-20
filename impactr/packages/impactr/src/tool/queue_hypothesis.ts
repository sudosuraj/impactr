import { Effect, Schema } from "effect"
import path from "path"
import * as Tool from "./tool"
import { HypothesisQueue } from "@impactr-ai/core/session/hypothesis-queue"
import { KnowledgeGraph } from "@impactr-ai/core/knowledge/graph"
import { AttackGraph } from "@impactr-ai/core/attack-graph/graph"
import { Plan } from "@impactr-ai/core/session/plan"
import { KnowledgeSaturation } from "@impactr-ai/core/session/saturation"
import { EngagementReport } from "@impactr-ai/core/session/engagement-report"
import { FSUtil } from "@impactr-ai/core/fs-util"
import { Session } from "@/session/session"
import { engagementRoot } from "./engagement-session"

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0)

export const Parameters = Schema.Struct({
  action: Schema.optional(Schema.Literals(["add", "next", "list"])).annotate({
    description:
      "add (queue a new follow-up, default), next (pull the highest-potential queued hypothesis to work on now), or list (review the backlog).",
  }),
  sourceFindingId: Schema.optional(Schema.String).annotate({
    description: "For 'add': the Knowledge Graph finding id that sparked this hypothesis.",
  }),
  description: Schema.optional(Schema.String).annotate({ description: "For 'add': a clear description of what to investigate." }),
  priority: Schema.optional(Schema.Number).annotate({
    description: "For 'add': 0.0-1.0 fallback priority (used only if the source finding has no score yet).",
  }),
})

export const QueueHypothesisTool = Tool.define(
  "queue_hypothesis",
  Effect.gen(function* () {
    const queue = yield* HypothesisQueue
    const graph = yield* KnowledgeGraph
    const attackGraph = yield* AttackGraph
    const plan = yield* Plan
    const saturation = yield* KnowledgeSaturation
    const fs = yield* FSUtil.Service
    const sessions = yield* Session.Service

    // Auto-synthesize the consolidated engagement report from the shared graph state and write it to
    // findings/ENGAGEMENT-REPORT.md. Deterministic (no LLM) and idempotent (overwrites), so it's
    // safe to (re)generate at every wind-down. Returns the relative path, or undefined when there's
    // nothing to report or the working directory can't be resolved.
    const writeReport = (sid: string, conclusion: EngagementReport.Conclusion) =>
      Effect.gen(function* () {
        const findings = yield* graph.summarize(sid, 200)
        const graphState = yield* attackGraph.getGraph(sid)
        if (findings.length === 0 && Object.keys(graphState.nodes).length === 0) return undefined
        const session = yield* sessions.get(sid as any).pipe(Effect.catch(() => Effect.succeed(undefined)))
        if (!session?.directory) return undefined
        const objectives = yield* plan.get(sid)
        const content = EngagementReport.render({
          sessionId: sid,
          generatedAt: new Date(),
          conclusion,
          findings,
          graph: graphState,
          plan: objectives,
        })
        const rel = "findings/ENGAGEMENT-REPORT.md"
        // No inner catch: a write failure must propagate to the outer catch below (→ undefined),
        // not be swallowed here — otherwise the caller reports the report as written when it isn't.
        yield* fs.writeWithDirs(path.join(session.directory, rel), content)
        return rel
      }).pipe(Effect.catch(() => Effect.succeed(undefined)))

    return {
      description: `Your hypothesis backlog — the reactive engine of a long engagement. Queue side-leads you spot mid-task so they are never lost, then work them down when your current thread settles so the engagement keeps going instead of stopping at the first pass.
- action "add" (default): queue a follow-up — a promising parameter, a partial auth bypass, a notably vulnerable service. It is prioritized by the source finding's computed potential (novelty × impact × confidence), falling back to your stated priority.
- action "next": pull the highest-potential queued hypothesis and work it now (delegate the heavy part as usual). Keep pulling until the backlog is empty before you wind down — an empty backlog with scope exhausted is how an engagement concludes.
- action "list": review everything still queued.`,
      parameters: Parameters,
      execute: (args: Schema.Schema.Type<typeof Parameters>, ctx) =>
        Effect.gen(function* () {
          const sid = yield* engagementRoot(sessions, ctx.sessionID as string)
          const action = args.action ?? "add"

          if (action === "next") {
            const next = yield* queue.popHighestPriority(sid)
            if (!next) {
              // Backlog drained — the engagement is winding down. Auto-synthesize the consolidated
              // report now, deterministically, so a run always ends with a readable artifact. This
              // path has no budget signal to check (unlike the hosted runner), so an empty-but-not-
              // saturated backlog is labeled "backlog-drained", not "budget-exhausted" — the budget
              // was never consulted, so claiming it was exhausted would be a fabricated conclusion.
              const saturated = yield* saturation.isSaturated(sid).pipe(Effect.catch(() => Effect.succeed(false)))
              const report = yield* writeReport(sid, saturated ? "saturated" : "backlog-drained")
              const reportLine = report ? ` Consolidated engagement report written to ${report}.` : ""
              return saturated
                ? `Backlog empty and knowledge saturated — the engagement is concluding.${reportLine} Do a final skim of the attack graph; if nothing new remains, you are done.`
                : `Backlog empty — no queued hypotheses remain.${reportLine} If genuinely fresh surface remains (new subdomains/ports/credentials), re-scan it and queue leads; otherwise wind down.`
            }
            // Work it inline this turn; mark done so it isn't re-pulled. New leads you find go back in via "add".
            yield* queue.complete(next.id, "done")
            return `Next hypothesis (potential ${next.priority.toFixed(2)}): ${next.description}\n\nWork this now — delegate the heavy part via task — then pull the next one.`
          }

          if (action === "list") {
            const pending = yield* queue.peekAll(sid)
            if (pending.length === 0) return "No pending hypotheses in the backlog."
            return `Pending hypotheses (highest potential first):\n${pending
              .map((h) => `- [${h.priority.toFixed(2)}] ${h.description} (id:${h.id})`)
              .join("\n")}`
          }

          // add
          if (!args.sourceFindingId || !args.description)
            return "Error: 'add' requires sourceFindingId and description."
          const potential = yield* graph.getPotentialScore(args.sourceFindingId)
          const id = yield* queue.push(sid, {
            sourceFindingId: args.sourceFindingId,
            description: args.description,
            priority: potential > 0 ? potential : clamp01(args.priority ?? 0.5),
          })
          return `Hypothesis queued successfully with ID: ${id}.`
        }).pipe(
          Effect.catch((e: unknown) => Effect.succeed(`Error: ${e instanceof Error ? e.message : String(e)}`)),
          Effect.map((output) => ({ title: "queue_hypothesis", metadata: {}, output })),
        ),
    }
  }),
)
