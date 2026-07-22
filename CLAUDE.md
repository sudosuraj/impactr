# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Impactr is an **autonomous AI penetration-testing agent**, built on a forked
general-purpose agent runtime (re-purposed for offensive security instead of
coding). The fork lives entirely under `impactr/`; almost all real work happens there.

Repository layout (this git root):

| Path | Purpose |
|---|---|
| `impactr/` | The Impactr application. All builds, tests, and typechecking happen inside this directory. |
| `.agents/` | Old human-readable reference copies (recon playbook skill under `.agents/skills/`). NOT loaded by anything — do not treat as authoritative. |

### Source of truth for the running CLI (read this before editing agents or tools)

The local CLI (`bun run dev`, `packages/impactr/src/index.ts`) is what actually runs. Its agents and tools are **defined in code**, not in any `.md`/`.json` config file:

| What | Where (the ONLY place to edit) |
|---|---|
| **Agents** (prompt + permissions) | `impactr/packages/impactr/src/agent/agent.ts` (definitions) + `impactr/packages/impactr/src/agent/prompt/*.txt` (prompts). The primary agent is `attack` ("full engagement", prompt `orchestrator.txt`); subagents are `enumerate`, `exploit`, `report`; plus `recon`. |
| **Tools** the agents can call | `impactr/packages/impactr/src/tool/registry.ts` + `impactr/packages/impactr/src/tool/*` (e.g. `task` = delegation, `attack_graph`, `attack_plan`, `record_discovery`, `queue_hypothesis`, `technique`, `shell`, `read`, …). A tool that isn't registered here is NOT available to the running agents, no matter what a prompt says. |
| **Shared data stores** (used by both CLI and hosted) | `impactr/packages/core/src/{attack-graph,knowledge,session/plan,session/saturation,session/hypothesis-queue}` — the SQLite-backed graph/knowledge/plan state. Safe to build on; the runtime tools read/write these. |

**Trap (this has burned us):** `impactr/packages/core/src/tool/*`, `impactr/packages/core/src/session/runner/*`, and any `.impactr/agent/*.md` override files are a **separate V2 / hosted-server lineage that the local CLI does NOT load.** Editing a tool or agent there changes nothing about what the CLI agent can do. When adding a capability to the running agent, add it under `packages/impactr/src/tool` + `registry.ts` and reference it from `packages/impactr/src/agent/prompt/*.txt` — then rebuild. Verify by checking the tool appears in the agent's materialized tool list, not by reading the prompt.

### The CLI and hosted (V2) lineages silently drift — audit both, every time

This is the single biggest source of bugs in this codebase and has already cost real functionality (see below). There are **two independent implementations** of almost everything pentest-specific — one wired into the CLI (`packages/impactr`), one wired into the hosted/web V2 runtime (`packages/core`) — and **nothing automated keeps them in sync**. Nothing fails CI when they diverge; a tool can silently lose a capability on one side and no test will catch it.

**Why two implementations exist at all:** the CLI runs on an older, simpler single-session engine (`SessionV1`, `packages/impactr/src/session`, tools defined via `Tool.define` in `packages/impactr/src/tool/tool.ts`). The hosted runtime is a newer, multi-tenant, durable engine ("V2 Session Core", see `impactr/CONTEXT.md` and `impactr/AGENTS.md`), with tools defined via `Tool.make` in `packages/core/src/tool/tool.ts` — a genuinely different `Context`/error/registration shape. That wrapper-level split is real and not something to casually merge. **But the domain logic inside those wrappers — algorithms, spec lists, scoring, what a tool is even capable of doing — has no reason to differ, and should never be hand-duplicated.**

**Naming trap:** the same tool is named differently in each lineage — CLI files use snake_case (`attack_graph.ts`, `record_discovery.ts`, `queue_hypothesis.ts`, `get_scope.ts` under `packages/impactr/src/tool/`), hosted files use kebab-case (`attack-graph.ts`, `record-discovery.ts`, `queue-hypothesis.ts`, `get-scope.ts` under `packages/core/src/tool/`). Grepping for one name will not surface its counterpart — check both directories by capability, not by filename.

**What we found on the first real audit (2026-07), as a cautionary baseline:** every pentest-domain tool pair had drifted, and some gaps were severe — the hosted `technique` tool was missing `scan_vulnerabilities` (nuclei) *entirely*, and hosted `queue_hypothesis` only supported `action: "add"`, meaning the hosted/web agent had no way to run the "pop the next hypothesis when idle" loop that the Continuous Discovery Engine is built around (see below) — the actual product mechanic simply didn't exist server-side. `webfetch` was missing `sslVerify`/`proxy`/custom `method`/`headers`/`body` — all pentest-relevant (self-signed target certs, Burp/ZAP routing). `attack_graph` was missing exploit-chain tracing. `grep`/`glob` were missing `exclude`/`ignoreCase`. None of this was caught by typecheck, lint, or tests, because both sides typecheck fine independently — they just do different things.

**Agent definitions had the same problem, worse:** the hosted V2 orchestrator (`packages/core/src/plugin/agent.ts`) had inherited the generic fork's allow-all default instead of the CLI orchestrator's deny-by-default, delegate-only design — the "hard capability boundary" called out below did not exist server-side. Hosted was also missing the `enumerate` and `report` agents entirely, and its `attack` id collided with the CLI's *primary orchestrator* name while actually meaning the *exploit subagent* role. This has been fixed (see the single source of truth below), but treat it as the sharpest illustration of how far this can drift before anyone notices — nothing failed CI here either.

**The fix pattern (apply this going forward, to agents as much as tools):**
1. When a capability's core content is pure (no session/permission/framework dependency) — a scoring function, a spec list, a graph algorithm, an agent's prompt/description/permission intent — put it **once** under `packages/core/src/<domain>/` (not inside `src/tool/` or hand-copied into each agent registration) and have **both** the CLI wrapper and the hosted wrapper import that same module. Established examples: `packages/core/src/attack-graph/chains.ts` (exploit-chain finding, shared by both `attack_graph` tools), `packages/core/src/technique/specs.ts` (the technique engine list, shared by both `technique` tools), and `packages/core/src/agent/{pentest,prompt}.ts` (the full pentest agent roster — prompts, names, modes, descriptions, and a framework-agnostic `PermissionIntent` — shared by `packages/impactr/src/agent/agent.ts` and `packages/core/src/plugin/agent.ts`).
2. Only the thin wrapper (Schema/Input shape, permission-Ruleset conversion, session-vs-hosted-DB branching) is allowed to differ between the two lineages, because that part is legitimately tied to `SessionV1` vs V2. For agents specifically, that means each side converts the shared `PermissionIntent` into its own Ruleset shape (`configFromIntent` in `agent.ts`, `rulesFromIntent` in `plugin/agent.ts`) — never re-typing the actual allow/deny list by hand.
3. When you add a **new** pentest capability or agent, wire it into **both** lineages in the same change, even if the hosted side isn't "launched" yet — deferring the hosted half is exactly how the gaps above accumulated.

Scope note: Impactr must only be pointed at systems with explicit written authorization; the agents forbid exploiting anything outside the operator-authorized scope.

## Commands

All commands run from `impactr/` unless noted.

```sh
bun install                    # install workspace deps (bun 1.3.14, see packageManager in package.json)
bun run dev                    # run the CLI (packages/impactr/src/index.ts)
bun turbo typecheck             # typecheck the whole workspace (root script: `bun run typecheck`)
bun typecheck                  # typecheck a single package — run from that package dir (e.g. packages/core), never call `tsc` directly
oxlint                         # lint (root script: `bun run lint`)
```

Tests **cannot** run from the repo root (`impactr/`) — a bunfig guard (`do-not-run-tests-from-root`) blocks it. Run them from the package directory instead:

```sh
cd packages/core && bun test                                   # whole package
cd packages/core && bun test test/attack-graph.test.ts         # single file
cd packages/impactr && bun test --timeout 30000 --only-failures  # this package's own convention
```

`bun run script/upgrade-opentui.ts` and the various `script/*.ts` files under `impactr/script/` handle release/versioning tasks; not needed for day-to-day feature work.

## Architecture

### Monorepo shape

Bun workspaces + Turborepo. Packages live in `impactr/packages/*` and are named `@impactr-ai/<name>` (the CLI package itself is just `impactr`, at `packages/impactr`, and builds the `bin/impactr` executable). Dependency direction is enforced and matters when adding imports:

- `Schema` → `Core` and `Protocol` → `Server`
- `Client` (runtime) may depend on `Schema` and `Protocol` only — **never** `Core` or `Server`
- `sdk-next` composes `Client` + `Core` + `Server`

After changing the public Protocol or Server `HttpApi`, run `bun run generate` from `packages/client` — never hand-edit `src/generated` or `src/generated-effect`.

### Pentesting domain layer (packages/core)

This is what makes Impactr different from the general-purpose runtime it forked. It lives in `packages/core/src/`:

- **`attack-graph/`** — per-session graph of discovered assets/relationships and exploitation state (nodes + edges), persisted to SQLite so it survives restarts within an engagement. Exposed to agents via the `attack_graph` tool (`src/tool/attack-graph.ts`).
- **`knowledge/`** — the Knowledge Graph of findings. Each finding is scored `noveltyScore × impactScore × confidenceScore = potential`, which drives what gets explored next. Findings are deduped by a stable content fingerprint (sorted-key JSON hash), but evidence accumulates: re-recording a known finding raises each score to the per-dimension max (monotonic, never a downgrade), so `potential` tracks the strongest evidence rather than freezing at the first sighting. `addFinding` reports the outcome as `created` / `upgraded` / `duplicate`; only `created` and `upgraded` (genuine progress) feed the saturation signal, so re-scanning the same assets can't mask saturation. Exposed via `record_discovery` (`src/tool/record-discovery.ts`).
- **`src/tool/queue-hypothesis.ts`** — queues a follow-up worth investigating later instead of derailing the current task; the engine pops the highest-`potential` hypothesis when an agent would otherwise go idle.
- **`src/tool/draft-vulnerability.ts`** — writes structured Markdown vulnerability reports into `findings/`.

This is the **Continuous Discovery Engine**: it keeps a session running autonomously, popping queued hypotheses as agents go idle, until knowledge *saturates* (discovery rate drops below a threshold) or the session budget is exhausted.

### Agent roles

The **content** of the five pentest agents — prompt text, name, mode, description, and a framework-agnostic permission intent (`{denyByDefault, allow, deny}`) — is defined **once**, as the single source of truth, in `packages/core/src/agent/pentest.ts` (prompts in the sibling `packages/core/src/agent/prompt/*.txt`). Both lineages consume it rather than hand-duplicating it: `packages/impactr/src/agent/agent.ts` (CLI, SessionV1) and `packages/core/src/plugin/agent.ts` (hosted, V2) each convert the shared `PermissionIntent` into their own Ruleset shape locally — that conversion is the one place the two session frameworks still legitimately differ (see the drift-trap section above). There is no separate `.md`/`.json` agent-definition system — the old parallel one was deleted, since it never loaded and only caused drift.

- **`attack`** (primary, prompt `orchestrator.txt`) — the full-engagement orchestrator: plans strategy, owns the Attack Graph, delegates heavy work to subagents via the `task` tool. Deny-by-default permission (`*: deny`) with an explicit allow-list for strategy/scope/graph/delegation tools only — it runs no shell, edit, webfetch, or technique tools itself; every concrete action against the target is delegated to a subagent.
- **`recon`** (primary, prompt `recon.txt`) — reconnaissance-only entry agent; maps surface, never exploits.
- **`enumerate`** (subagent, prompt `enumerate.txt`) — deep active enumeration/fuzzing via the technique tools; spawned by `attack`.
- **`exploit`** (subagent, prompt `exploit.txt`) — proves out one specific discovered vulnerability; spawned by `attack`.
- **`report`** (subagent, prompt `report.txt`) — writes the final structured report from the shared attack graph.

Delegation is the `task` tool (`packages/impactr/src/tool/task.ts`), not `run_agent`. To change an agent's prompt, description, or which actions it's allowed to call, edit `packages/core/src/agent/pentest.ts` (or the relevant `.txt` file) — **do not** edit the prompt/permission literals directly in `agent.ts` or `plugin/agent.ts`, they should only reference the shared definition. To change what a tool itself does, register it in `packages/impactr/src/tool/registry.ts` (CLI) and `packages/core/src/tool/builtins.ts` (hosted).

### Session runtime

The rest of `packages/core` (`src/session`, `src/system-context`, `src/agent`, etc.) is the general upstream-derived agent runtime — durable session history, System Context assembly, tool registry, permissions. The terminology and invariants for this layer (Context Epoch, Session Drain, Mid-Conversation System Message, the public `HttpApi`/Client/SDK contract, etc.) are precisely defined in `impactr/CONTEXT.md`; read it before touching session/context code, since the terms there are used exactly and are easy to get subtly wrong.

### Which "web app" is which — do not conflate these (2026-07 finding)

This monorepo has several `packages/*` that look like "the web app" at a glance. They are **not** redundant with each other; they are different products with different auth models. Check dependents before assuming any one of them is dead code or a duplicate to merge/remove:

| Package | What it actually is | Auth model | Real dependents (checked by grepping actual imports, not just package.json) |
|---|---|---|---|
| `packages/server` | The real `HttpApi` backend — `Api`, `handlers`, `locationLayer`, `PtyEnvironment`. | Single shared username/password (`IMPACTR_SERVER_PASSWORD`) or none at all in embedded mode. **Not multi-tenant, and not supposed to be** — see below. | `packages/cli`'s `impactr serve` command runs these routes directly; `packages/impactr/src/server/*` (the CLI's own embedded local server) imports `Api`/`handlers`/`locationLayer` from it directly (not just types); `packages/sdk-next` embeds it for programmatic use. |
| `packages/app` | The SolidJS chat/session UI that talks to `packages/server`. | Whatever `packages/server` enforces (see above). | `packages/desktop` depends on it directly for its own shell. |
| `packages/dashboard` | The actual customer-facing, multi-tenant Impactr product: `login`/`scans`/`findings`/`reports`/`settings` routes, attack-graph visualization, a security score. | Real per-organization auth: `UserTable`/`MembershipTable`/`OrganizationTable`, session cookie carrying `{userID, organizationID}` (`src/lib/auth.ts`). Design doc: `specs/tenant-model.md`. | Has its own direct DB connection (`src/lib/db.ts`, Drizzle against the same hosted tables `packages/core`'s hosted tool lineage writes) — does **not** call `packages/server`'s `HttpApi` at all. |
| `packages/console` | A separate SST app (`mail`/`function`/`resource`/`support`) — looks like internal ops/billing tooling, not customer-facing. | Its own, unrelated to the above. | Not audited yet. |
| `packages/enterprise` | A SolidStart scaffold with no customized routes yet (still the default template README) — likely unstarted. | N/A | None found. |

**Why `packages/server` being single-tenant is correct, not a gap:** it's a remote-control view of *your own* running CLI session (`impactr serve`, the embedded browser view, the desktop app) — conceptually a local dev tool, not a hosted product. Multi-tenancy doesn't apply to "watch your own terminal session in a browser." Do not try to add organization/multi-tenant auth here or delete it in favor of `dashboard`; they solve different problems and multiple real commands/packages depend on it as-is.

**`packages/dashboard`'s tenant-scoping rule (see `packages/dashboard/src/lib/queries.ts`'s own header comment and `specs/tenant-model.md`):** every dashboard query must join through `engagement.organization_id` — never trust a bare `finding`/`asset`/`engagement` id without it. Found and fixed one violation of this on the first audit: `getEngagementTimeline`/`getEngagementAttackGraphSummary` took a bare `engagementId` with no organization join. It wasn't actively exploitable (their one caller checked ownership first via `getEngagement(id, organizationID)`), but it was a landmine — any new caller that skipped that upstream check would leak one org's attack-graph/findings/audit-log data to another. When adding a new `dashboard` query function, it must take and enforce `organizationID` itself; don't rely on the caller to have already checked.

**`packages/core` lib gotcha:** unlike `packages/impactr`, `packages/core`'s tsconfig doesn't declare DOM types like `RequestInfo`, but its `typeof fetch` binding does still require `preconnect` (structurally, from a newer `lib.dom.d.ts`). When writing a custom-fetch shim in `packages/core` (as `tool/webfetch.ts` does for `sslVerify`/`proxy` support), type parameters off `Parameters<typeof fetch>` instead of the bare `RequestInfo` name, and cast the result `as typeof fetch` rather than trying to satisfy `preconnect` structurally.

**`packages/dashboard` had zero mutations besides login/logout (2026-07 finding):** no way to create an engagement or start a scan existed anywhere — not even server-side plumbing to build the UI on, since `packages/core` only ever had `HostedEngagement.get` (read-only) and the CLI's separate, local, non-org-scoped `EngagementStore`. Added `createEngagement` (`packages/dashboard/src/lib/mutations.ts`, wired into a "New engagement" modal on `/scans`): writes an authorized `Engagement` row plus its audit-log entry directly via the dashboard's own Drizzle connection, matching `queries.ts`'s existing style (no Effect runtime — the dashboard is deliberately lightweight and talks to the DB directly, not through `packages/server`'s `HttpApi`).

**Still open: creating an engagement does not start a live agent session.** The V2 session engine's `Location` is fundamentally directory/project-based (`Location.workspaceID` + a real filesystem `directory`, resolved via `project.resolve(...)`) — inherited from being a coding-agent runtime. A browser-triggered pentest engagement has no operator cwd and no natural equivalent. Guessing at a shared or per-request directory risks real tenant-isolation bugs, since `Location`-scoped file outputs (`findings/ENGAGEMENT-REPORT.md`, `draft_vulnerability`) are directory-based, not `engagement_id`-scoped — two engagements sharing a directory would collide. Before wiring "New engagement" to actually start a scan, this needs a real decision (e.g. provisioning an isolated workspace per engagement) — do not paper over it with a shared/guessed directory.

## Conventions (full detail in `impactr/AGENTS.md`)

- Branch names: at most three hyphen-separated words, no slashes or `type/` prefixes (e.g. `session-recovery`, not `feat/session-recovery`).
- Commits/PR titles: conventional-commit style, `type(scope): summary` (`feat`, `fix`, `docs`, `chore`, `refactor`, `test`).
- This fork's default branch is `main` (the upstream-derived note about `dev` in `impactr/AGENTS.md` does not apply here — check with `git branch -a` if unsure).
- No aliased or star imports (`import { foo as bar }`, `import * as Foo`); import a module's own namespace export by name instead.
- Prefer `const`, early returns over `else`, dot notation over destructuring, and inlining single-use variables.
- In `packages/core` Drizzle schemas, use snake_case field names so columns don't need string overrides.
- In Effect generators, bind services to named variables before calling methods — never nested `yield*` chains.
- Tests avoid mocks/`globalThis.*` and exercise the real implementation rather than duplicating its logic.
