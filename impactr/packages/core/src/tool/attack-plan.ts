export * as AttackPlanTool from "./attack-plan"

import { ToolFailure } from "@impactr-ai/llm"
import { Effect, Layer, Schema } from "effect"
import { makeLocationNode } from "../effect/app-node"
import { ToolRegistry } from "./registry"
import { Tool } from "./tool"
import { Tools } from "./tools"
import { Plan, node as PlanNode, type Objective, type ObjectiveStatus } from "../session/plan"
import { PermissionV2 } from "../permission"

export const name = "attack_plan"

/** Clamp a model-supplied priority into [0,1] so it stays comparable across objectives. */
const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0)

export const description = `Maintain your plan of attack — the scan hierarchy you build for yourself when you orient on a target and revise as you learn.
Use "add" to record an objective (optionally under a parent to build the hierarchy), with a priority reflecting where the bugs most likely live and a short rationale for why it matters.
Use "revise" to move an objective's status (pending → active → done, or abandoned) or reprioritize it as you learn.
Use "get" to review the current plan before deciding your next move.
This is your deliberate strategy, distinct from queue_hypothesis (a backlog of concrete leads you'll pop later): the plan is how you decide what to work on and in what order.`

const Status = Schema.Literals(["pending", "active", "done", "abandoned"])

export const Input = Schema.Struct({
  action: Schema.Literals(["add", "revise", "get"]).annotate({ description: "The action to perform." }),
  title: Schema.String.pipe(Schema.optional).annotate({ description: "Objective title (required for 'add')." }),
  parentId: Schema.String.pipe(Schema.optional).annotate({
    description: "Parent objective id to nest under, building the hierarchy (optional for 'add').",
  }),
  rationale: Schema.String.pipe(Schema.optional).annotate({
    description: "Why this objective matters — your reasoning (optional).",
  }),
  priority: Schema.Number.pipe(Schema.optional).annotate({
    description: "Value-weighted priority from 0.0 to 1.0; higher = more likely to hold impactful bugs.",
  }),
  objectiveId: Schema.String.pipe(Schema.optional).annotate({ description: "Objective id to revise (required for 'revise')." }),
  status: Status.pipe(Schema.optional).annotate({ description: "New status (for 'revise')." }),
})

export const Output = Schema.Struct({
  action: Schema.String,
  summary: Schema.String,
})
export type Output = typeof Output.Type

/** Render the flat, priority-ordered objective list as an indented hierarchy digest. */
const renderPlan = (objectives: ReadonlyArray<Objective>): string => {
  if (objectives.length === 0) return "The plan is empty. Add objectives to lay out your approach before diving in."
  const marker: Record<ObjectiveStatus, string> = { pending: "○", active: "◐", done: "●", abandoned: "✗" }
  const byParent = new Map<string | undefined, Objective[]>()
  for (const o of objectives) {
    const key = o.parentId
    const list = byParent.get(key) ?? []
    list.push(o)
    byParent.set(key, list)
  }
  const known = new Set(objectives.map((o) => o.id))
  const lines: string[] = []
  const walk = (parentId: string | undefined, depth: number) => {
    for (const o of byParent.get(parentId) ?? []) {
      const indent = "  ".repeat(depth)
      const why = o.rationale ? ` — ${o.rationale}` : ""
      lines.push(`${indent}${marker[o.status]} [${o.priority.toFixed(2)}] ${o.title} (id:${o.id})${why}`)
      walk(o.id, depth + 1)
    }
  }
  walk(undefined, 0)
  // Objectives whose parent is missing (e.g. parent abandoned/pruned) are still shown at root
  // so no objective is silently dropped from the digest.
  for (const o of objectives)
    if (o.parentId && !known.has(o.parentId))
      lines.push(`${marker[o.status]} [${o.priority.toFixed(2)}] ${o.title} (id:${o.id})${o.rationale ? ` — ${o.rationale}` : ""}`)
  return `Plan of attack (○ pending, ◐ active, ● done, ✗ abandoned):\n${lines.join("\n")}`
}

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools.Service
    const plan = yield* Plan
    const permission = yield* PermissionV2.Service

    yield* tools
      .register({
        [name]: Tool.make({
          description,
          input: Input,
          output: Output,
          toModelOutput: ({ output }) => [{ type: "text", text: output.summary }],
          execute: (input, context) =>
            permission
              .assert({
                action: "attack_plan",
                resources: ["*"],
                sessionID: context.sessionID,
                agent: context.agent,
                source: { type: "tool", messageID: context.assistantMessageID, callID: context.toolCallID },
              })
              .pipe(
                Effect.mapError(() => new ToolFailure({ message: "Permission denied: attack_plan" })),
                Effect.andThen(
                  Effect.gen(function* () {
                    switch (input.action) {
                      case "add": {
                        if (!input.title)
                          return { action: input.action, summary: "Error: title is required to add an objective." }
                        const id = yield* plan.add(context.sessionID, {
                          parentId: input.parentId,
                          title: input.title,
                          rationale: input.rationale,
                          priority: clamp01(input.priority ?? 0.5),
                          status: input.status,
                        })
                        return { action: input.action, summary: `Objective recorded (id:${id}).` }
                      }
                      case "revise": {
                        if (!input.objectiveId)
                          return { action: input.action, summary: "Error: objectiveId is required to revise." }
                        const found = yield* plan.revise(context.sessionID, input.objectiveId, {
                          status: input.status,
                          priority: input.priority === undefined ? undefined : clamp01(input.priority),
                          rationale: input.rationale,
                        })
                        return {
                          action: input.action,
                          summary: found ? `Objective ${input.objectiveId} revised.` : `Objective ${input.objectiveId} not found.`,
                        }
                      }
                      case "get": {
                        const objectives = yield* plan.get(context.sessionID)
                        return { action: input.action, summary: renderPlan(objectives) }
                      }
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
  name: "tool/attack-plan",
  layer,
  deps: [ToolRegistry.node, PermissionV2.node, PlanNode],
})
