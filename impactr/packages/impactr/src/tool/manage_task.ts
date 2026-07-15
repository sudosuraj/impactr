import { Effect, Schema } from "effect"
import { BackgroundJob } from "@/background/job"
import * as Tool from "./tool"

export const Parameters = Schema.Struct({
  action: Schema.Literals(["list", "kill", "status"]).annotate({ description: "The action to perform: 'list' (list all running tasks), 'kill' (cancel the task), 'status' (check the task status)." }),
  taskId: Schema.optional(Schema.String).annotate({ description: "The task ID to manage. Required when action is 'kill' or 'status'." }),
})

export const ManageTaskTool = Tool.define(
  "manage_task",
  Effect.gen(function* () {
    const background = yield* BackgroundJob.Service
    return {
    description: "Manage background tasks. Use this tool to list running tasks or interact with tasks that were sent to the background via background=true flag.",
    parameters: Parameters,
    execute: ({ action, taskId }, ctx) => Effect.gen(function* () {
      if (action === "list") {
        const jobs = yield* background.list()
        const running = jobs.filter(j => j.status === "running")
        if (running.length === 0) return "No running background tasks."
        return "Running Background Tasks:\n" + running.map(j => `- [${j.id}] ${j.type} (${j.title})`).join("\n")
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

        let out = `Task: ${job.id}\nType: ${job.type}\nStatus: ${job.status}\n`
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
