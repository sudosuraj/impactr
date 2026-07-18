import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { Plan, renderPlan } from "@impactr-ai/core/session/plan"
import { playbooks } from "@impactr-ai/core/session/playbook"

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0)

export const Parameters = Schema.Struct({
  action: Schema.Literals(["seed", "add", "revise", "get"]).annotate({ description: "The action to perform." }),
  playbook: Schema.optional(Schema.Literals(["web-app", "api", "external-network"])).annotate({
    description: "Starting methodology to seed from (required for 'seed').",
  }),
  title: Schema.optional(Schema.String).annotate({ description: "Objective title (required for 'add')." }),
  parentId: Schema.optional(Schema.String).annotate({ description: "Parent objective id to nest under (optional for 'add')." }),
  rationale: Schema.optional(Schema.String).annotate({ description: "Why this objective matters (optional)." }),
  priority: Schema.optional(Schema.Number).annotate({ description: "Value-weighted priority 0.0-1.0; higher = more likely to hold impactful bugs." }),
  objectiveId: Schema.optional(Schema.String).annotate({ description: "Objective id to revise (required for 'revise')." }),
  status: Schema.optional(Schema.Literals(["pending", "active", "done", "abandoned"])).annotate({ description: "New status (for 'revise')." }),
})

export const AttackPlanTool = Tool.define(
  "attack_plan",
  Effect.gen(function* () {
    const plan = yield* Plan
    return {
      description: `Maintain your plan of attack — the prioritized scan hierarchy you build for yourself and revise as you learn.
Use "seed" with a playbook (web-app, api, external-network) to lay down a starting methodology for the target type, then adapt it.
Use "add" to record an objective (optionally under a parent), with a priority reflecting where the bugs most likely live.
Use "revise" to move an objective's status (pending → active → done, or abandoned) or reprioritize it.
Use "get" to review the current plan before deciding your next move.`,
      parameters: Parameters,
      execute: (args: Schema.Schema.Type<typeof Parameters>, ctx) =>
        Effect.gen(function* () {
          const sid = ctx.sessionID as string
          if (args.action === "seed") {
            if (!args.playbook) return "Error: playbook is required to seed (web-app, api, or external-network)."
            const count = yield* plan.seed(sid, playbooks[args.playbook])
            return `Seeded ${count} objectives from the ${args.playbook} playbook. Review with action 'get', then adapt priorities and add target-specific objectives as you learn.`
          }
          if (args.action === "add") {
            if (!args.title) return "Error: title is required to add an objective."
            const id = yield* plan.add(sid, {
              parentId: args.parentId,
              title: args.title,
              rationale: args.rationale,
              priority: clamp01(args.priority ?? 0.5),
              status: args.status,
            })
            return `Objective recorded (id:${id}).`
          }
          if (args.action === "revise") {
            if (!args.objectiveId) return "Error: objectiveId is required to revise."
            const found = yield* plan.revise(sid, args.objectiveId, {
              status: args.status,
              priority: args.priority === undefined ? undefined : clamp01(args.priority),
              rationale: args.rationale,
            })
            return found ? `Objective ${args.objectiveId} revised.` : `Objective ${args.objectiveId} not found.`
          }
          const objectives = yield* plan.get(sid)
          return objectives.length === 0
            ? "The plan is empty. Add objectives (or seed a playbook) to lay out your approach before diving in."
            : renderPlan(objectives)
        }).pipe(
          Effect.catch((e: unknown) => Effect.succeed(`Error: ${e instanceof Error ? e.message : String(e)}`)),
          Effect.map((output) => ({ title: `attack_plan: ${args.action}`, metadata: {}, output })),
        ),
    }
  }),
)
