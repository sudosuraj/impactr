# Impactr as an autonomous attacker — the cognitive model

> How Impactr should think and work: like an individual human hacker, not a machine running a
> fixed pipeline. This document defines the *mind* (the cognitive loop), the *hands* (a lean,
> non-overlapping toolkit), and the principle that keeps them coherent.

## The core idea: a mind, not a pipeline

A pipeline runs the same steps in the same order every time. A hacker does not. **The
intelligence is in the *choosing* — what to look at, what's interesting, what to do next — not
in the *running* of tools.** So Impactr is built as a mind with hands, not as an automation
pipeline:

- **The hands** are a small set of distinct *techniques* (tools).
- **The mind** is the Attack Graph (its model of the target) plus the judgment loop that decides
  the next move.
- **The workflow is a loop, not a line** — it bends around what the target actually is.

Handed a target, Impactr does **not** run every tool on every asset. It sizes the target up,
writes its own prioritized plan, and works that plan adaptively — exactly as a human would.

## The cognitive loop (a hacker's psychology)

These are Impactr's faculties, in the order a mind uses them. Each maps to a concrete mechanism;
`[built]` already exists, `[next]` is upcoming.

1. **Orient** `[partial]` — "What *is* this target, what's it built with, what does it *do*, where's
   the value?" Form a first impression and a mental map. → seeds the **Attack Graph**.
2. **Plan its own attack** `[built]` — from that impression, write a *prioritized hierarchy of
   objectives* (the "scan hierarchy"): go to the login, the upload, the `/api`, the admin panel
   first; ignore the marketing pages. → the **`attack_plan`** tool + `session/plan.ts`.
3. **Prioritize by value & instinct** `[built]` — attention is a budget. Weight custom/sensitive
   surface far above boilerplate. → objective `priority` in the plan; finding `potential`
   (`novelty × impact × confidence`) in the Knowledge Graph.
4. **Choose the next technique adaptively** `[partial]` — react to signal (found an API → think
   auth/IDOR; found an upload → think RCE). Never a fixed order. → orchestrator judgment over the
   plan + graph; sharpens as the technique tools land.
5. **Follow curiosity, but bounded** `[built]` — chase the interesting thread, keep a "come back
   to this" list, don't fall down endless holes. → **`queue_hypothesis`**.
6. **Hypothesize → test → learn** `[built]` — guess how it breaks, test cheaply, update belief as
   evidence sharpens. → evidence accumulation in the Knowledge Graph (re-recording upgrades scores,
   never resets them).
7. **Chain** `[built]` — combine small findings into big impact (SSRF→metadata→cloud-creds;
   IDOR→user-enum→mass-extract). Where humans beat scanners, and the headline differentiator of
   the strongest platforms in the field. → the orchestrator walks the Attack Graph's edges and
   composes chains as an explicit behavior (its prompt), **not** a separate tool — chaining is
   reasoning over state we already store, so it stays lean.
8. **Prove** `[next]` — never call it a bug until you've seen it fire. → verification tools.
9. **Know when to stop** `[built]` — recognize diminishing returns instead of grinding. →
   saturation (counts only genuine new discovery, so re-scanning can't fake progress).

The distinctive faculty that turns "AI running tools" into "a hacker working a target" is
**Orient + Plan (1–2)** — Impactr writing and revising its *own* strategy. That is now built
(`attack_plan`); the technique tools (below) are the hands that execute it.

## The plan is not the hypothesis queue

These are complementary faculties, deliberately **not** duplicates:

| | **Plan** (`attack_plan`) | **Hypothesis queue** (`queue_hypothesis`) |
|---|---|---|
| Shape | A **tree** of objectives (parent/child hierarchy) | A **flat** priority queue |
| Origin | **Top-down** — deliberate strategy | **Bottom-up** — leads spotted mid-work |
| Lifecycle | **Revised** across the whole engagement | **Popped once** when an agent goes idle |
| Answers | "What is my approach, and in what order?" | "What concrete lead should I not forget?" |

## The hands: a lean, non-overlapping toolkit

**The rule: one tool = one distinct kind of work and one distinct source of signal. No two tools
produce the same thing by the same means — and the mind *chooses* which technique to deploy
rather than running them all.** That second half is the line between intelligence and a pipeline.

A subtlety this rule does *not* violate: finding endpoints by **crawling**, by **archives**, by
**brute-forcing**, and by **reading JavaScript** are not duplicates — they reach different parts
of the surface (linked-now / linked-once / unlinked-but-guessable / revealed-by-client-code). A
human treats those as four separate instincts and picks the ones that fit the target (heavy SPA →
the JS is where the endpoints are; brute-forcing is a waste there).

### State & judgment (the mind's own tools)

| Tool | Intent | Status |
|---|---|---|
| `get_scope` | Confirm authorized targets/exclusions before any action. | built |
| `attack_plan` | Write and revise the plan of attack (the scan hierarchy). | built |
| `attack_graph` | Read/write the structured map of assets, relationships, and status. | built |
| `record_discovery` | Log a normalized finding with novelty/impact/confidence scoring. | built |
| `queue_hypothesis` | Park a concrete side-lead for later. | built |
| `draft_vulnerability` | Write the structured, reproducible report. | built |
> Deliberately **not** built as tools: triage, chain-detection, and CVE/intel lookup. These are
> *judgment the orchestrator already performs* over the graph it can read (chaining is now an
> explicit orchestrator behavior) plus `websearch`/`webfetch` for intel — turning them into tools
> would add selection overhead for no new ability. Benchmark research is clear that the strongest
> agents carry the *fewest, most general* tools, so we keep the action space lean.

### Techniques (the work tools — each wraps a proven engine, normalizes to the graph)

Every technique tool: typed *target* input → hidden proven engine(s) → normalize into the
existing Attack Graph asset schema (`ip`/`port`/`subdomain`/`endpoint`/`credential`/`vulnerability`
+ `resolves_to`/`hosts`/`exposes`/`uses`/`vulnerable_to`) → persist with dedup + scoring → return
a **compact digest**, not the raw dump → scope-gated, rate-aware, idempotent.

**Built** (`src/technique/` + `src/tool/technique.ts`): the Phase-1/2 discovery cluster on one
shared scaffold — `enumerate_subdomains`, `resolve_dns`, `scan_ports`, `probe_http`, `crawl_site`,
`harvest_urls`, `discover_content`, `discover_api_spec`, `analyze_javascript`, `mine_parameters`.
Re-discovering an asset **enriches** its graph node (merges new attributes) rather than
overwriting, so `mine_parameters` attaching params to an endpoint httpx already found sharpens the
map. Each is just
`{engine, argv, parser}`; the parsers (`technique/parse.ts`) are pure and fixture-tested, ingestion
(`technique/ingest.ts`) upserts into the graph with dedup. The engine shell-out is graceful (a
missing binary yields an advisory digest, not a crash), and because output becomes typed nodes
rather than echoed text, these tools are **injection-safe by construction**.

| Tool | Distinct signal it provides |
|---|---|
| `enumerate_subdomains` | Names that exist under a root domain (passive + active). |
| `resolve_dns` | Resolution + wildcard/takeover-prone records. |
| `scan_ports` | Open ports and their service/version banners. |
| `probe_http` | HTTP liveness, status/title/redirects/TLS/headers **and** tech fingerprint (one place — no separate fingerprint tool). |
| `crawl_site` | Endpoints reachable by following the live app. |
| `harvest_urls` | Endpoints that were linked once (archives) but are gone now. |
| `discover_content` | Unlinked-but-guessable paths (backups, `.git`, `.env`, admin). |
| `analyze_javascript` | Hidden API routes, params, and secrets revealed by client code. |
| `mine_parameters` | Unlinked request parameters on a known endpoint. |
| `discover_api_spec` | OpenAPI/Swagger/GraphQL schema → every operation and parameter. |
| `scan_vulnerabilities` | Template/signature *candidates* (recon-safe; never exploits). |
| `enrich_cve` | Known CVEs + public exploits for a fingerprinted tech+version. |
| `verify_finding` | Reproduces one candidate and captures proof (upgrades its scores). |
| `test_injection` | Focused injection probing on one parameter/endpoint. |
| `test_access_control` | BOLA/IDOR, privilege-escalation, mass-assignment (top API bugs). |
| `capture_evidence` | Screenshot / response / reproducible PoC artifact for the report. |

> Note the consolidation: tech fingerprinting lives **inside** `probe_http` rather than as a
> separate `fingerprint_tech` tool — same work, so one tool.

## How it runs (loop, not line)

```
orient (seed graph) → attack_plan: write objectives, prioritized by value
   └─ loop until saturated or scope exhausted:
        attack_plan(get) → pick highest-priority pending objective
          → choose the ONE technique that fits it (not all of them)
             → delegate to recon/attack subagent
                → record_discovery / attack_graph  (normalize results)
                   → attack_plan(revise + add)      (learn: update strategy)
                   → queue_hypothesis(side-leads)   (curiosity, bounded)
        when a lead is proven-worthy → attack agent: verify → draft_vulnerability
```

## Grounded in the field — what we adapt

The design above lines up with what current research and tooling have converged on. The
adaptations we're pulling in:

1. **Context management is the dominant failure mode — not capability.** Studies of LLM pentest
   agents repeatedly find that models *can* hack but fail on looping, context loss, recency bias,
   and hallucination (parameter fabrication, tool-output misinterpretation, cross-turn memory
   corruption); reasoning degrades as a long engagement's transcript accumulates. → Our answer is
   the hard rule **structured state over transcripts**: the Attack Graph + Plan are durable
   external memory; the transcript is disposable. The engine now **re-grounds the agent in its
   own plan on every idle-continuation** (see `session/runner/llm.ts`) so it keeps working its
   strategy instead of drifting.
2. **The plan-as-tree is proven (PentestGPT's "Pentesting Task Tree").** A task tree that "encodes
   the ongoing status and steers subsequent actions" is exactly `attack_plan`; PentestGPT credits
   it with overcoming memory loss. We adopt two refinements: feed the plan back in natural-language
   form each cycle (done), and treat **parsing/normalizing noisy tool output into structured
   summaries** as an explicit step every technique tool routes through (the "digest, not dump"
   rule, made a first-class faculty when the technique tools land).
3. **Validate before reporting — the "verification gap."** Leading systems run
   discover → *validate* → exploit; agents otherwise "execute exploit code but fail to trigger
   actual vulnerabilities," and can be fooled by honeypots/canary/deceptive services. →
   `verify_finding` must reproduce-and-prove, plus a **corroboration/skepticism** discipline
   (a "too easy" finding is a possible honeypot; independent sightings are what raise confidence —
   which the evidence-accumulation scoring already models).
4. **Target output is untrusted input.** Memory/prompt-injection research shows agents get
   hijacked via poisoned retrieved content. Impactr ingests target-controlled text (responses,
   banners, JS, errors) into its context. Adopted: **untrusted-content fencing**
   (`util/untrusted.ts`) wraps target-controlled tool output (`bash`, `webfetch`) in an
   unforgeable boundary — the boundary token is stripped from the content so a target can't close
   the fence early — and each agent is told once to **treat fenced content as data, never
   instructions**, so an injected page or banner can't rewrite the plan or scope.
5. **Methodology as *seeds*, not rails.** Declarative recon frameworks (Osmedeus/reconFTW/nuclei)
   prove the value of encoded methodology. Adopted: **playbook templates seed the Plan**
   (`session/playbook.ts`; `attack_plan(action: "seed", playbook: …)` for web-app / API /
   external-network) with a prioritized objective hierarchy the agent then reprioritizes, prunes,
   and extends — proven start, human-like adaptation on top. A human never starts from a blank page.
6. **Objective accuracy measurement.** Adopted: an **evaluation harness** (`src/eval/harness.ts`;
   see docs/evaluation.md) scores an engagement's recorded findings against a case's expected
   findings with weighted **partial credit** (pass/fail hides multi-step progress). Pure and
   tested end-to-end against a real Knowledge Graph; a benchmark adapter maps CyBench / NYU-CTF
   challenges to eval cases. Turns "accuracy" from a goal into a measured number.
7. **Fewest, most general tools win — keep bash first-class.** Benchmark research (and the
   strongest commercial platforms) find that agents with a small, general toolset outperform ones
   with sprawling structured toolkits: many tools burn reasoning budget on tool selection, and
   `bash` is maximally composable. We resolve the tension with **general execution + structured
   memory**: `bash` stays the default hammer, the technique tools are *optional accelerators* that
   normalize into the Attack Graph (fixing shell-first's weakness — context/state decay), and we
   don't grow the toolkit past distinct techniques. This is why triage/chaining/intel are behaviors,
   not tools.

## What's built vs. next

- **Built:** the mind's core — Attack Graph, Knowledge Graph with evidence accumulation,
  hypothesis queue, saturation, scope gating, and the **Plan / scan-hierarchy** faculty
  (`attack_plan`), which now **drives the engine loop** (the plan is re-injected as structured
  memory on every idle-continuation) and **seeds from playbooks** (web-app / API /
  external-network methodology the agent adapts).
- **Next (build order):**
  1. `probe_http` — first technique adapter end-to-end (JSON → normalize → graph → digest),
     proving the "structured state, not transcripts" pattern.
  2. Phase-1 techniques (`enumerate_subdomains`, `resolve_dns`, `scan_ports`).
  3. Content/interface techniques (`crawl_site`, `harvest_urls`, `discover_content`,
     `analyze_javascript`, `mine_parameters`, `discover_api_spec`).
  4. Candidacy + judgment (`scan_vulnerabilities`, `enrich_cve`, `triage_candidates`,
     `detect_chains`, `lookup_intel`).
  5. Verification/exploitation (`verify_finding`, `test_injection`, `test_access_control`,
     `capture_evidence`).
