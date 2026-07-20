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

All agents are defined **once**, in code, at `packages/impactr/src/agent/agent.ts` (permissions) with prompts in `packages/impactr/src/agent/prompt/*.txt`. There is no separate `.md`/`.json` agent-definition system anymore — the old parallel one was deleted, since it never loaded and only caused drift.

- **`attack`** (primary, prompt `orchestrator.txt`) — the full-engagement orchestrator: plans strategy, owns the Attack Graph, delegates heavy work to subagents via the `task` tool. Broad permission (`*: allow`) minus a few denies.
- **`recon`** (primary, prompt `recon.txt`) — reconnaissance-only entry agent; maps surface, never exploits.
- **`enumerate`** (subagent, prompt `enumerate.txt`) — deep active enumeration/fuzzing via the technique tools; spawned by `attack`.
- **`exploit`** (subagent, prompt `exploit.txt`) — proves out one specific discovered vulnerability; spawned by `attack`.
- **`report`** (subagent, prompt `report.txt`) — writes the final structured report from the shared attack graph.

Delegation is the `task` tool (`packages/impactr/src/tool/task.ts`), not `run_agent`. To change an agent's behavior, edit its `.txt` prompt; to change what it can call, edit its permission block in `agent.ts` and register the tool in `packages/impactr/src/tool/registry.ts`.

### Session runtime

The rest of `packages/core` (`src/session`, `src/system-context`, `src/agent`, etc.) is the general upstream-derived agent runtime — durable session history, System Context assembly, tool registry, permissions. The terminology and invariants for this layer (Context Epoch, Session Drain, Mid-Conversation System Message, the public `HttpApi`/Client/SDK contract, etc.) are precisely defined in `impactr/CONTEXT.md`; read it before touching session/context code, since the terms there are used exactly and are easy to get subtly wrong.

## Conventions (full detail in `impactr/AGENTS.md`)

- Branch names: at most three hyphen-separated words, no slashes or `type/` prefixes (e.g. `session-recovery`, not `feat/session-recovery`).
- Commits/PR titles: conventional-commit style, `type(scope): summary` (`feat`, `fix`, `docs`, `chore`, `refactor`, `test`).
- This fork's default branch is `main` (the upstream-derived note about `dev` in `impactr/AGENTS.md` does not apply here — check with `git branch -a` if unsure).
- No aliased or star imports (`import { foo as bar }`, `import * as Foo`); import a module's own namespace export by name instead.
- Prefer `const`, early returns over `else`, dot notation over destructuring, and inlining single-use variables.
- In `packages/core` Drizzle schemas, use snake_case field names so columns don't need string overrides.
- In Effect generators, bind services to named variables before calling methods — never nested `yield*` chains.
- Tests avoid mocks/`globalThis.*` and exercise the real implementation rather than duplicating its logic.
