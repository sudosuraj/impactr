import { effectCmd } from "../effect-cmd"
import { Effect } from "effect"
import { UI } from "../ui"
import { EngagementStore } from "@impactr-ai/core/engagement/store"

/**
 * Operator-only authorization for a local (non-hosted) engagement. Running this is the
 * human act of attesting "I am authorized to test this scope" — it writes a real,
 * persisted, revocable engagement record that get_scope then reads, so agents have a
 * genuine authorization record to work against offline. Agents cannot run this.
 */
export const EngagementCommand = effectCmd({
  command: "engagement <action>",
  describe: "Manage local engagement authorization",
  instance: false,
  builder: (yargs) =>
    yargs
      .positional("action", { choices: ["authorize"] as const, demandOption: true, describe: "authorize a local scope" })
      .option("name", { type: "string", default: "Local engagement", describe: "Engagement label" })
      .option("target", { type: "string", demandOption: true, describe: "Authorized target, e.g. acme-corp.com" })
      .option("scope", {
        type: "string",
        demandOption: true,
        describe: "Authorized scope, e.g. '*.acme-corp.com, 10.0.0.0/24'",
      })
      .option("exclusions", { type: "string", describe: "Comma-separated out-of-scope targets" })
      .option("attestation", { type: "string", describe: "Who/what authorizes this (recorded on the record)" }),
  handler: (args) =>
    Effect.gen(function* () {
      const store = yield* EngagementStore.Service
      const exclusions = args.exclusions
        ? args.exclusions
            .split(",")
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0)
        : []
      const engagement = yield* store.authorize({
        name: args.name,
        target: args.target,
        scope: args.scope,
        exclusions,
        authorizedBy: args.attestation,
      })
      yield* Effect.sync(() =>
        UI.println(
          `Authorized local engagement "${engagement.name}" (${engagement.id})\n` +
            `  Target: ${engagement.scope.target.name} — ${engagement.scope.target.scope}\n` +
            `  Exclusions: ${exclusions.length > 0 ? exclusions.join(", ") : "(none)"}`,
        ),
      )
    }),
})
