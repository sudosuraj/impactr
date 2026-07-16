import { effectCmd, fail } from "../effect-cmd"
import { Effect } from "effect"
import { UI } from "../ui"
import { EngagementStore } from "@impactr-ai/core/engagement/store"

/**
 * Operator-only management of local (non-hosted) engagement authorization. Running
 * `authorize` is the human act of attesting "I am authorized to test this scope" — it
 * writes a real, persisted, revocable engagement record that get_scope then reads, so
 * agents have a genuine authorization record to work against offline. Agents cannot run this.
 */
export const EngagementCommand = effectCmd({
  command: "engagement <action>",
  describe: "Manage local engagement authorization (authorize | list | revoke)",
  instance: false,
  builder: (yargs) =>
    yargs
      .positional("action", { choices: ["authorize", "list", "revoke"] as const, demandOption: true })
      .option("name", { type: "string", default: "Local engagement", describe: "Engagement label (authorize)" })
      .option("target", { type: "string", describe: "Authorized target, e.g. acme-corp.com (authorize)" })
      .option("scope", { type: "string", describe: "Authorized scope, e.g. '*.acme-corp.com, 10.0.0.0/24' (authorize)" })
      .option("exclusions", { type: "string", describe: "Comma-separated out-of-scope targets (authorize)" })
      .option("attestation", { type: "string", describe: "Who/what authorizes this, recorded on the record (authorize)" })
      .option("id", { type: "string", describe: "Engagement id (revoke)" }),
  handler: (args) =>
    Effect.gen(function* () {
      const store = yield* EngagementStore.Service

      if (args.action === "list") {
        const engagements = yield* store.list()
        if (engagements.length === 0) {
          yield* Effect.sync(() => UI.println("No local engagements. Authorize one with `impactr engagement authorize`."))
          return
        }
        yield* Effect.sync(() =>
          UI.println(
            engagements
              .map((e) => `${e.id}  [${e.status}]  ${e.name}  —  ${e.scope.target.name} (${e.scope.target.scope})`)
              .join("\n"),
          ),
        )
        return
      }

      if (args.action === "revoke") {
        if (!args.id) return yield* fail("`engagement revoke` requires --id <engagement-id> (see `engagement list`).")
        yield* store.revoke(args.id as any)
        yield* Effect.sync(() => UI.println(`Revoked local engagement ${args.id}.`))
        return
      }

      // authorize
      if (!args.target || !args.scope)
        return yield* fail("`engagement authorize` requires --target <t> and --scope <s>.")
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
