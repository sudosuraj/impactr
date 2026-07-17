# Impactr

Impactr is an **autonomous AI penetration-testing agent**. It is built on a forked
general-purpose agent runtime, re-purposed so that instead of writing
application code it maps attack surface, forms and tests hypotheses, and drafts professional
vulnerability reports.

## How it works

Impactr runs a small team of specialized agents driven by a **Continuous Discovery Engine**:

- **`orchestrator`** (primary) — owns the shared **Attack Graph**, plans strategy, and delegates
  work to its subagents rather than scanning directly.
- **`recon`** (subagent) — enumerates assets, ports, and directories, and records every finding.
- **`attack`** (subagent) — exploits a single, orchestrator-assigned vulnerability and proves impact.

As the agents work they:

1. **Record discoveries** into a Knowledge Graph (`record_discovery`), scoring each by
   novelty × impact × confidence.
2. **Queue hypotheses** for anything worth a focused follow-up (`queue_hypothesis`) instead of
   getting distracted.
3. **Map state** in the Attack Graph (`attack_graph`) to track relationships and avoid looping.
4. **Draft vulnerabilities** as structured Markdown in `findings/` (`draft_vulnerability`).

The engine keeps the session running autonomously — when the agent would go idle it pops the
highest-priority hypothesis and continues — and stops when knowledge **saturates** (the discovery
rate falls below a threshold) or the session **budget** is exhausted.

## Repository layout

| Path | Purpose |
|---|---|
| `impactr/` | The Impactr application. Core runtime lives in `impactr/packages/core`. |
| `.agents/` | Human-readable reference definitions of the pentesting agents and the recon playbook. |
| `impactr/.impactr/agent/` | The agent definitions the runtime actually loads (`orchestrator`, `recon`, `attack`). |

## Scope and authorization

Impactr is intended for **authorized** security testing only. The agents must operate strictly
within an explicitly authorized scope, and the recon playbook forbids exploiting anything during
reconnaissance. Do not point Impactr at systems you do not have written permission to test.

## Development

```sh
cd impactr
bun install
bun run dev          # run the CLI
bun turbo typecheck  # typecheck the workspace
```
