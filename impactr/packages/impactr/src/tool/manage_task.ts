import { Effect, Schema } from "effect"
import { BackgroundJob } from "@/background/job"
import { Session } from "@/session/session"
import type { SessionID } from "@/session/schema"
import * as Tool from "./tool"

export const Parameters = Schema.Struct({
  action: Schema.Literals(["list", "kill", "status", "tree"]).annotate({ description: "The action to perform: 'list' (list all running tasks), 'kill' (cancel the task), 'status' (check the task status), 'tree' (show every subagent session spawned from here so far, including nested sub-delegations)." }),
  taskId: Schema.optional(Schema.String).annotate({ description: "The task ID to manage. Required when action is 'kill' or 'status'." }),
})

const MAX_TREE_DEPTH = 10
const MAX_TREE_NODES = 200

function formatIdle(idleMs?: number) {
  if (idleMs === undefined) return ""
  const minutes = Math.floor(idleMs / 60_000)
  if (minutes < 1) return ""
  return `, idle ${minutes}m`
}

export const ManageTaskTool = Tool.define(
  "manage_task",
  Effect.gen(function* () {
    const background = yield* BackgroundJob.Service
    const sessions = yield* Session.Service
    return {
    description: "Manage background tasks. Use this tool to list running tasks, interact with tasks that were sent to the background via background=true flag, or view the tree of subagent sessions spawned so far (including grandchildren) with 'tree'. A subagent idle for a while with no activity (no tool calls, no output) is auto-promoted to background so you regain control — check 'list'/'tree' for '(idle Nm)' and use 'kill' if it's genuinely stuck.",
    parameters: Parameters,
    execute: ({ action, taskId }, ctx) => Effect.gen(function* () {
      if (action === "list") {
        const jobs = yield* background.list()
        const running = jobs.filter(j => j.status === "running")
        if (running.length === 0) return "No running background tasks."
        return "Running Background Tasks:\n" + running.map(j => `- [${j.id}] ${j.type} (${j.title})${formatIdle(j.idle_ms)}`).join("\n")
      }

      if (action === "tree") {
        const jobs = yield* background.list()
        const jobByID = new Map(jobs.map((job) => [job.id, job]))

        const lines: string[] = []
        // Bounded DFS guards against an unexpected cycle or runaway fan-out in the delegation tree.
        const stack: Array<{ id: SessionID; depth: number }> = [{ id: ctx.sessionID, depth: 0 }]
        while (stack.length > 0 && lines.length < MAX_TREE_NODES) {
          const { id, depth } = stack.pop()!
          if (depth > MAX_TREE_DEPTH) continue
          const children = yield* sessions.children(id)
          // Push in reverse so children render in creation order despite the stack's LIFO pop.
          for (const child of [...children].reverse()) {
            if (lines.length >= MAX_TREE_NODES) break
            const job = jobByID.get(child.id)
            const status = job ? ` (${job.status}${formatIdle(job.idle_ms)})` : ""
            lines.push(`${"  ".repeat(depth)}- [${child.id}] ${child.agent ?? "unknown"}: ${child.title}${status}`)
            stack.push({ id: child.id, depth: depth + 1 })
          }
        }

        if (lines.length === 0) return "No subagent sessions spawned yet."
        return "Subagent Session Tree:\n" + lines.join("\n")
      }

      if (!taskId) return "Error: taskId is required for kill or status actions."

      if (action === "kill") {
        const result = yield* background.cancel(taskId)
        if (!result) return `Task ${taskId} not found.`
        return `Task ${taskId} has been cancelled.`
      }

      if (action === "status") {
        const job = yield* background.get(taskId)
        if (!job) return `Task ${taskId} not found.`

        let out = `Task: ${job.id}\nType: ${job.type}\nStatus: ${job.status}${formatIdle(job.idle_ms)}\n`
        if (job.title) out += `Title: ${job.title}\n`
        if (job.output) out += `\n--- Output ---\n${job.output}\n`
        if (job.error) out += `\n--- Error ---\n${job.error}\n`
        return out
      }

      return "Unknown action"
    }).pipe(Effect.map((output) => ({ title: `manage_task: ${action}`, metadata: {}, output }))),
    }
  })
)
