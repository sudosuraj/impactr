# Impactr Pipeline — the Tool Catalog

> The attacker's action space. This document defines the **Impactr tools** that make up the
> autonomous pentest pipeline. It is about *capabilities*, not binaries.

## What "tool" means in Impactr

An **Impactr tool is a verb in the agent's action space** — a capability the LLM (or a
deterministic pipeline stage) invokes to make progress. It is *not* a wrapper around one
security binary. It is an **intent** with a stable, structured contract.

A single tool like `enumerate_subdomains` may internally run `subfinder`, then `amass`, then
`dnsx`, merge and dedupe the results, and drop the losers — but the agent never sees any of
that. It sees one capability: "enumerate the subdomains of `example.com`, and get back a
deduped, resolved list that is already in the Attack Graph." The engine underneath can be
swapped (subfinder → something better) without changing the agent's action space at all.

This is the whole point of the redesign the current freeform-`bash` approach lacks: the agent
should reason about **what attacker move to make**, not about command-line flags and output
parsing.

### Anatomy of every Impactr tool

Every tool in this catalog shares the same shape (mirrors `Tool.make` in
`packages/core/src/tool/`):

| Part | Contract |
|---|---|
| **Intent** | One attacker move, named as a verb. What a human hacker would say they're "doing." |
| **Input** | A typed struct — a *target*, not a command. `{ domain }`, `{ url }`, `{ host, ports? }`. |
| **Engine(s)** | 1..N proven external tools, run with sane flags + machine-readable output. Hidden. |
| **Normalize** | Parse engine output into Impactr's asset schema (host/service/endpoint/param/tech/vuln). |
| **Persist** | Write normalized nodes/edges to the Attack Graph + findings to the Knowledge Graph, with dedup + scoring (evidence accumulates — re-running sharpens scores, never resets them). |
| **Return** | A **compact digest** to the model — counts, the interesting few, what changed — never the raw multi-thousand-line dump. Raw output is stored to disk for drill-down. |
| **Gate** | Assert `get_scope` before touching a target; honor rate limits; be idempotent (don't re-scan what the graph already knows). |

### The two conceptual layers

- **Judgment tools** — the LLM's reasoning surface (prioritize, correlate, chain, decide to go
  manual). Cheap, fast, no network.
- **Work tools** — the capabilities that actually touch the target (enumerate, crawl, scan,
  verify). These wrap the external toolkit and do the heavy lifting.

The **pipeline** is a choreography of work tools; the **agent** overrides or extends that
choreography using judgment tools when a lead is worth a human-style detour.

---

## The catalog

Grouped by pipeline phase. `[exists]` = already implemented; `[new]` = to build.
"Agent" = which role owns it (`recon` / `attack` / `orchestrator`).

### Phase 0 — State & judgment (the brain)

| Tool | Intent | Writes | Agent |
|---|---|---|---|
| `get_scope` `[exists]` | Confirm the authorized targets/exclusions before any action. | — | all |
| `attack_graph` `[exists]` | Read/write the structured map of assets, relationships, and status. | graph | orchestrator |
| `record_discovery` `[exists]` | Log a normalized finding with novelty/impact/confidence scoring. | knowledge | all |
| `queue_hypothesis` `[exists]` | Park a lead worth a separate focused investigation. | queue | all |
| `triage_candidates` `[new]` | Cluster/dedupe raw scanner hits into a ranked shortlist of *worth-verifying* findings, discarding noise. Pure reasoning over the graph. | knowledge | orchestrator |
| `detect_chains` `[new]` | Graph traversal that spots multi-step exploit chains (SSRF→metadata→cloud-creds; IDOR→user-enum→mass-extract). | graph edges | orchestrator |
| `lookup_intel` `[new]` | Structured intel lookup: given a tech+version or a bug class, return known CVEs, exploit-db entries, default creds, and technique notes. (Generalizes `websearch`/`webfetch` into a hacker's "I'll google that version" reflex.) | knowledge | all |

### Phase 1 — Asset discovery (map the surface)

| Tool | Intent | Writes |
|---|---|---|
| `enumerate_subdomains` `[new]` | Passive + active subdomain discovery for a root domain. | host nodes |
| `resolve_dns` `[new]` | Resolve hosts (A/AAAA/CNAME/MX/NS/TXT), detect wildcards and takeover-prone dangling records. | host nodes, edges |
| `scan_ports` `[new]` | Port + service discovery on a host, with service/version banners. | service nodes |
| `probe_http` `[new]` | HTTP(S) liveness across hosts/ports: status, title, redirect chain, TLS, security headers, and a first-pass tech fingerprint. | endpoint + tech nodes |

### Phase 2 — Content & interface discovery (find the doors)

| Tool | Intent | Writes |
|---|---|---|
| `crawl_site` `[new]` | Active spider of a live host — follow links, forms, JS-rendered routes. | endpoint nodes |
| `harvest_urls` `[new]` | Passive URL collection from archives (wayback / common-crawl / gau-style sources). Finds dead/forgotten endpoints a crawler never reaches. | endpoint nodes |
| `discover_content` `[new]` | Directory/file brute-forcing with context-aware wordlists (backups, `.git`, `.env`, admin panels). | endpoint nodes |
| `analyze_javascript` `[new]` | **JS discovery**: fetch and parse JS bundles/source maps to extract hidden API routes, endpoints, parameters, and leaked secrets/keys. The single highest-yield modern-web capability. | endpoint + param + secret nodes |
| `mine_parameters` `[new]` | Discover hidden/unlinked request parameters on an endpoint. | param nodes |
| `fingerprint_tech` `[new]` | Deep, versioned stack identification (framework, CMS, server, WAF, libraries). Feeds `lookup_intel`. | tech nodes |
| `discover_api_spec` `[new]` | Find and parse OpenAPI/Swagger/GraphQL schemas; enumerate every operation, method, and parameter. The entry point for the API-testing playbook. | endpoint + param nodes |

### Phase 3 — Vulnerability candidacy (where might it break)

| Tool | Intent | Writes | Agent |
|---|---|---|---|
| `scan_vulnerabilities` `[new]` | Run the template/signature corpus (nuclei-class) against known assets. **Recon-safe: produces candidates, never exploits.** | vuln-candidate nodes / hypotheses | recon |
| `enrich_cve` `[new]` | For each fingerprinted tech+version, attach known CVEs and public exploit availability as scored candidates. | vuln-candidate nodes | recon |

### Phase 4 — Verification & exploitation (prove it — the human part)

Owned by the `attack` agent, tightly scoped to one assigned target/finding. **A candidate is
never a finding until a tool here reproduces it and captures proof.**

| Tool | Intent | Writes |
|---|---|---|
| `verify_finding` `[new]` | Actively reproduce a single candidate and capture concrete proof (request/response, diff, timing). Turns "nuclei says XSS" into "here is the XSS firing." Upgrades the finding's confidence/impact (scores accumulate). | knowledge (upgrade) |
| `test_injection` `[new]` | Focused injection probing on one parameter/endpoint (SQLi/XSS/SSTI/command). Under strict scope + rate limits. | knowledge |
| `test_access_control` `[new]` | Auth-matrix testing for APIs/web: BOLA/IDOR, privilege escalation, mass-assignment, missing function-level auth — the top API bug classes. | knowledge |
| `capture_evidence` `[new]` | Screenshot / save response / write a reproducible PoC artifact for the report. | findings/ artifacts |

### Phase 5 — Reporting

| Tool | Intent | Writes |
|---|---|---|
| `draft_vulnerability` `[exists]` | Write the structured, reproducible vulnerability report (steps, CVSS, impact, remediation). | findings/ + hosted DB |

---

## How the tools compose into the pipeline

The deterministic pipeline is a choreography of the **same tools the agent can call ad hoc**.
A default web-app run:

```
get_scope
  └─ enumerate_subdomains → resolve_dns → scan_ports → probe_http     (Phase 1, fan out per root)
       └─ for each live host, in parallel:
            crawl_site + harvest_urls + discover_content + analyze_javascript   (Phase 2)
              └─ mine_parameters + fingerprint_tech
                   └─ scan_vulnerabilities + enrich_cve                (Phase 3, candidates)
                        └─ triage_candidates + detect_chains           (judgment: rank + chain)
                             └─ queue_hypothesis(top leads)
                                  └─ attack agent: verify_finding / test_*   (Phase 4, prove)
                                       └─ draft_vulnerability            (Phase 5)
```

- **Deterministic where it should be**: the fan-out (Phases 1–3) is mechanical; the engine runs
  it without burning LLM cycles on every step.
- **LLM-driven where judgment matters**: the forks a human would stop and think about —
  `discover_api_spec` found a schema → switch to the API playbook; `fingerprint_tech` found old
  Jira → `enrich_cve` then queue an attack; `analyze_javascript` leaked a key → chase it now.
- **The graph is the shared memory**: every tool reads and writes it, so the pipeline and the
  agent never lose each other's context, and `saturation` measures *real* new discovery, not
  re-scans.

## Cross-cutting requirements (true of every tool)

1. **Scope-gated** — assert `get_scope` before any packet leaves. Non-negotiable for autonomy.
2. **Normalize to the graph** — the agent reasons over structured state, not tool transcripts.
3. **Digest, not dump** — bounded, decision-oriented output to the model; raw to disk.
4. **Idempotent** — consult the graph; don't re-enumerate what's already known (the loop signal
   already exists via `loopCount`).
5. **Rate-aware** — pace like a human; back off on WAF/ban signals.
6. **Evidence accumulates** — re-running a tool on a known asset sharpens its scores, never
   resets them (already implemented in the Knowledge Graph).
7. **Engine-agnostic** — the external binary is swappable behind the tool's contract.

## Build order

1. **Asset schema** — the normalized node/edge types (host, service, endpoint, param, tech,
   secret, vuln-candidate) every tool reads/writes. Foundation for all of it.
2. **`probe_http`** — first end-to-end adapter (JSON → normalize → graph → digest). Proves the
   pattern and de-noises the model's context immediately.
3. **Phase 1 set** — `enumerate_subdomains`, `resolve_dns`, `scan_ports`.
4. **Phase 2 set** — `crawl_site`, `harvest_urls`, `discover_content`, `analyze_javascript`,
   `mine_parameters`, `discover_api_spec`.
5. **Phase 3 + judgment** — `scan_vulnerabilities`, `enrich_cve`, `triage_candidates`,
   `detect_chains`, `lookup_intel`.
6. **Phase 4** — verification/exploitation tools.
7. **Pipeline engine** — the deterministic choreography over all of the above.
