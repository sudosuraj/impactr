import { Effect, Context, Layer } from "effect"
import { Database } from "../database/database"
import { PlanObjectiveTable } from "./sql"
import { makeGlobalNode } from "../effect/app-node"
import { and, eq, desc, isNull } from "drizzle-orm"

/**
 * The engagement's plan of attack — the "scan hierarchy" Impactr writes for itself when it
 * orients on a target, and revises as it learns. This is the deliberate, top-down strategy
 * layer: a tree of prioritized objectives (a login flow to test, an API surface to map, an
 * upload to probe), where `priority` encodes a hacker's value-weighted attention.
 *
 * It is deliberately distinct from the hypothesis queue, not a duplicate of it:
 *   - Plan objectives are a persisted *hierarchy* (parent/child) that is *revised* over the
 *     whole engagement — the map of intent.
 *   - Hypotheses are a *flat backlog* of concrete leads *popped once* when an agent goes idle —
 *     the reactive execution queue.
 * Different shape (tree vs queue), different lifecycle (revise vs pop-once), different origin
 * (planning vs discovery).
 */

export type ObjectiveStatus = "pending" | "active" | "done" | "abandoned"

export interface Objective {
  readonly id: string
  readonly parentId: string | undefined
  readonly title: string
  readonly rationale: string | undefined
  /** Value-weighted attention in [0,1]: where the bugs most likely live. */
  readonly priority: number
  readonly status: ObjectiveStatus
}

/**
 * A hierarchical objective spec used to seed the plan from a starting methodology (a playbook).
 * These are *seeds, not rails*: once inserted they are ordinary objectives the agent reprioritizes,
 * revises, and extends — a human hacker starts from a mental methodology and adapts it, never from
 * a blank page.
 */
export interface ObjectiveTree {
  readonly title: string
  readonly priority: number
  readonly rationale?: string
  readonly children?: ReadonlyArray<ObjectiveTree>
}

export interface Interface {
  /**
   * Add an objective to the plan, optionally under a parent. Deduplicates on
   * (parent, title) among non-terminal objectives so re-stating an existing objective
   * revises it rather than forking the tree.
   */
  readonly add: (
    sessionId: string,
    objective: {
      readonly parentId?: string
      readonly title: string
      readonly rationale?: string
      readonly priority: number
      readonly status?: ObjectiveStatus
    },
  ) => Effect.Effect<string>

  /** Revise an objective's status, priority, and/or rationale. Only supplied fields change. */
  readonly revise: (
    sessionId: string,
    id: string,
    patch: {
      readonly status?: ObjectiveStatus
      readonly priority?: number
      readonly rationale?: string
    },
  ) => Effect.Effect<boolean>

  /**
   * Seed the plan from a starting methodology (a playbook): insert a subtree of objectives,
   * parents before children. Reuses the same dedup as `add`, so seeding an already-seeded plan
   * sharpens it instead of duplicating. Returns the number of objectives inserted or refreshed.
   */
  readonly seed: (sessionId: string, nodes: ReadonlyArray<ObjectiveTree>) => Effect.Effect<number>

  /** The full plan, ordered highest-priority first, so callers can render the hierarchy. */
  readonly get: (sessionId: string) => Effect.Effect<ReadonlyArray<Objective>>
}

export class Plan extends Context.Service<Plan, Interface>()("@impactr-ai/core/session/plan") {}

const toObjective = (row: typeof PlanObjectiveTable.$inferSelect): Objective => ({
  id: row.id,
  parentId: row.parent_id ?? undefined,
  title: row.title,
  rationale: row.rationale ?? undefined,
  priority: row.priority,
  status: row.status as ObjectiveStatus,
})

const MARKER: Record<ObjectiveStatus, string> = { pending: "○", active: "◐", done: "●", abandoned: "✗" }

/**
 * Render a priority-ordered objective list as an indented hierarchy digest. Shared by the
 * `attack_plan` tool and the engine's idle-continuation, so the agent always sees its plan in
 * one consistent form. Returns "" for an empty plan so callers can decide whether to show it.
 */
export const renderPlan = (objectives: ReadonlyArray<Objective>): string => {
  if (objectives.length === 0) return ""
  const byParent = new Map<string | undefined, Objective[]>()
  for (const o of objectives) {
    const list = byParent.get(o.parentId) ?? []
    list.push(o)
    byParent.set(o.parentId, list)
  }
  const known = new Set(objectives.map((o) => o.id))
  const lines: string[] = []
  const line = (o: Objective, depth: number) =>
    `${"  ".repeat(depth)}${MARKER[o.status]} [${o.priority.toFixed(2)}] ${o.title} (id:${o.id})${
      o.rationale ? ` — ${o.rationale}` : ""
    }`
  const walk = (parentId: string | undefined, depth: number) => {
    for (const o of byParent.get(parentId) ?? []) {
      lines.push(line(o, depth))
      walk(o.id, depth + 1)
    }
  }
  walk(undefined, 0)
  // Objectives whose parent id points at nothing (e.g. a bogus parentId passed to attack_plan,
  // which has no SQL foreign key) are orphan roots. Surface each such orphan AND its whole subtree
  // — walking from the missing parent id renders the orphans and recurses into their children — so
  // no objective is silently dropped from the digest.
  const missingParents = new Set<string>()
  for (const o of objectives) if (o.parentId && !known.has(o.parentId)) missingParents.add(o.parentId)
  for (const parentId of missingParents) walk(parentId, 0)
  return `Plan of attack (○ pending, ◐ active, ● done, ✗ abandoned):\n${lines.join("\n")}`
}

export const layer = Layer.effect(
  Plan,
  Effect.gen(function* () {
    const database = yield* Database.Service
    const db = database.db

    // Shared insert-or-sharpen used by both `add` and `seed`, so seeding a playbook dedupes
    // exactly the way manual planning does.
    const addOne = (
      sessionId: string,
      objective: {
        readonly parentId?: string
        readonly title: string
        readonly rationale?: string
        readonly priority: number
        readonly status?: ObjectiveStatus
      },
    ) =>
      Effect.gen(function* () {
        // Dedupe against a live objective with the same parent + title so re-planning the
        // same intent doesn't grow a forest of identical branches. Terminal objectives
        // (done/abandoned) don't block a fresh one — the surface may be worth revisiting.
        const parentMatch = objective.parentId
          ? eq(PlanObjectiveTable.parent_id, objective.parentId)
          : isNull(PlanObjectiveTable.parent_id)
        const existing = yield* db
          .select()
          .from(PlanObjectiveTable)
          .where(and(eq(PlanObjectiveTable.session_id, sessionId as any), parentMatch, eq(PlanObjectiveTable.title, objective.title)))
          .all()
          .pipe(Effect.orDie)
        const live = existing.find((row) => row.status === "pending" || row.status === "active")
        if (live) {
          // Re-stating an objective raises its priority to the stronger of the two and
          // refreshes rationale, so re-planning sharpens focus rather than duplicating.
          const priority = Math.max(live.priority, objective.priority)
          yield* db
            .update(PlanObjectiveTable)
            .set({ priority, rationale: objective.rationale ?? live.rationale })
            .where(eq(PlanObjectiveTable.id, live.id))
            .pipe(Effect.orDie)
          return live.id
        }

        const id = crypto.randomUUID()
        yield* db
          .insert(PlanObjectiveTable)
          .values({
            id,
            session_id: sessionId as any,
            parent_id: objective.parentId ?? null,
            title: objective.title,
            rationale: objective.rationale ?? null,
            priority: objective.priority,
            status: objective.status ?? "pending",
          })
          .pipe(Effect.orDie)
        return id
      })

    const seedInto = (sessionId: string, parentId: string | undefined, nodes: ReadonlyArray<ObjectiveTree>): Effect.Effect<number> =>
      Effect.gen(function* () {
        let count = 0
        for (const node of nodes) {
          const id = yield* addOne(sessionId, {
            parentId,
            title: node.title,
            rationale: node.rationale,
            priority: node.priority,
          })
          count += 1 + (yield* seedInto(sessionId, id, node.children ?? []))
        }
        return count
      })

    return Plan.of({
      add: (sessionId, objective) => addOne(sessionId, objective),

      seed: (sessionId, nodes) => seedInto(sessionId, undefined, nodes),

      revise: (sessionId, id, patch) =>
        Effect.gen(function* () {
          const existing = yield* db
            .select({ id: PlanObjectiveTable.id })
            .from(PlanObjectiveTable)
            .where(and(eq(PlanObjectiveTable.session_id, sessionId as any), eq(PlanObjectiveTable.id, id)))
            .get()
            .pipe(Effect.orDie)
          if (!existing) return false
          const set: Record<string, unknown> = {}
          if (patch.status !== undefined) set.status = patch.status
          if (patch.priority !== undefined) set.priority = patch.priority
          if (patch.rationale !== undefined) set.rationale = patch.rationale
          if (Object.keys(set).length > 0)
            yield* db.update(PlanObjectiveTable).set(set).where(eq(PlanObjectiveTable.id, id)).pipe(Effect.orDie)
          return true
        }),

      get: (sessionId) =>
        db
          .select()
          .from(PlanObjectiveTable)
          .where(eq(PlanObjectiveTable.session_id, sessionId as any))
          .orderBy(desc(PlanObjectiveTable.priority))
          .pipe(Effect.orDie, Effect.map((rows) => rows.map(toObjective))),
    })
  }),
)

export const node = makeGlobalNode({
  service: Plan,
  layer,
  deps: [Database.node],
})
