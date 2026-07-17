# Measuring Impactr's accuracy — the evaluation harness

> Turns "accuracy" from a goal into a number. Given a known target, declare the findings a
> competent hacker should produce, run Impactr, and score what it actually recorded.

## Why partial credit

Research on LLM offensive agents finds that pass/fail scoring hides real progress: agents
routinely get *most* of the way through a multi-step target — find the endpoint, confirm the
class, but miss the final proof — and a binary metric buries that. So the harness scores **weighted
recall**: a run that finds 3 of 4 planted vulnerabilities scores 0.75, and a high-value finding can
be weighted above a low-value one. Overall accuracy is the mean score across cases; `passRate` (the
fraction *fully* solved) is reported alongside it.

## Model

An engagement's output is the set of findings Impactr recorded in the Knowledge Graph. An **eval
case** declares what should have been found:

```ts
interface ExpectedFinding {
  type: string       // finding type that must appear ("vulnerability", "endpoint", "flag", …)
  contains: string   // substring that must appear (case-insensitively) in the finding's JSON data
  weight?: number    // partial-credit weight (default 1)
  label?: string     // human label for reporting
}
interface EvalCase { id; name; category; expected: ExpectedFinding[] }
```

The scorer (`src/eval/harness.ts`) is **pure and target-agnostic**:

- `scoreCase(evalCase, observed)` → `{ score, passed, matched, missing }` — weighted recall of the
  expected findings against what the agent recorded. An expected finding matches when some observed
  finding has the same `type` and its JSON data contains `contains` (case-insensitively).
- `summarizeSuite(results)` → overall `passRate` and `meanScore`, plus the same per category.
- `renderSummary(summary)` → a compact human report.

Because it's pure, it is fully unit-tested, including end-to-end against a real Knowledge Graph
(seed findings the way `record_discovery` does, read them back, score) — see `test/eval.test.ts`.

## Running a suite

1. **Define** cases (`EvalCase[]`) — or generate them with a benchmark adapter (below).
2. **Run** Impactr on each case's target (the existing session runner drives the engagement).
3. **Read** the session's findings: `KnowledgeGraph.summarize(sessionID, large)` →
   `{ type, data }[]`.
4. **Score**: `scoreCase(case, observed)` per case, then `summarizeSuite(results)`.

## Plugging in CyBench / NYU-CTF

These benchmarks are challenge sets with a known success signal (a flag, or a specific
vulnerability). A thin adapter maps each challenge to an `EvalCase`:

- **CTF flags** → `{ type: "flag", contains: "flag{…}" }` (Impactr records a captured flag as a
  `flag` finding via `record_discovery`, or the adapter reads it from the drafted report).
- **Vulnerability challenges** → one `ExpectedFinding` per planted vulnerability, weighted by
  severity.

The adapter provisions the challenge target (container/range), runs Impactr against it under scope
authorization, then scores. Only the provisioning + run step is environment-specific; the case
format, scorer, and reporting are shared. Standard harnesses to target: CyBench (40 challenges) and
NYU CTF Bench (200 challenges).

## What this unlocks

A single accuracy number per change. Every improvement to scoring, planning, the technique tools,
or verification can be measured against the same suite instead of argued about — regressions show
up as a drop in `meanScore`, and new capabilities show up as a rise.
