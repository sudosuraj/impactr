export * as EvalHarness from "./harness"

/**
 * Evaluation harness — turns "accuracy" from a goal into a measured number.
 *
 * An engagement's outcome is the set of findings Impactr recorded. An eval case declares the
 * findings a competent hacker *should* have produced for a known target; the scorer compares the
 * two and reports weighted recall. Partial credit matters: research on LLM offensive agents (e.g.
 * partial-credit CTF evaluation) shows pass/fail alone hides real progress on multi-step targets,
 * so a run that finds 3 of 4 planted vulnerabilities scores 0.75, not 0.
 *
 * The scorer is pure and target-agnostic. A benchmark adapter (CyBench / NYU-CTF, or a private
 * range) maps each challenge's expected result — a flag to capture, a vulnerability to prove — to
 * `ExpectedFinding[]`, runs Impactr, reads the session's findings, and scores. See docs/evaluation.md.
 */

/** One thing the agent was expected to discover, matched against the findings it recorded. */
export interface ExpectedFinding {
  /** Finding type that must appear (e.g. "vulnerability", "credential", "flag"). */
  readonly type: string
  /** Substring that must appear (case-insensitively) in the matched finding's JSON data. */
  readonly contains: string
  /** Partial-credit weight; higher = more important. Defaults to 1. */
  readonly weight?: number
  /** Optional human label for reporting (e.g. "SQLi in /login"). */
  readonly label?: string
}

export interface EvalCase {
  readonly id: string
  readonly name: string
  readonly category: string
  readonly expected: ReadonlyArray<ExpectedFinding>
}

/** A finding the agent actually recorded, as read from the Knowledge Graph. */
export interface ObservedFinding {
  readonly type: string
  readonly data: unknown
}

export interface CaseResult {
  readonly id: string
  readonly name: string
  readonly category: string
  /** Weighted recall in [0,1]: matched expected weight over total expected weight. */
  readonly score: number
  /** True only when every expected finding was discovered. */
  readonly passed: boolean
  readonly matched: ReadonlyArray<ExpectedFinding>
  readonly missing: ReadonlyArray<ExpectedFinding>
}

const weightOf = (e: ExpectedFinding) => (e.weight === undefined ? 1 : e.weight)

const isMatched = (expected: ExpectedFinding, observed: ReadonlyArray<ObservedFinding>): boolean => {
  const needle = expected.contains.toLowerCase()
  return observed.some(
    (o) => o.type === expected.type && JSON.stringify(o.data ?? null).toLowerCase().includes(needle),
  )
}

/** Score one case: weighted recall of expected findings against what the agent recorded. */
export const scoreCase = (evalCase: EvalCase, observed: ReadonlyArray<ObservedFinding>): CaseResult => {
  const matched: ExpectedFinding[] = []
  const missing: ExpectedFinding[] = []
  for (const expected of evalCase.expected) (isMatched(expected, observed) ? matched : missing).push(expected)
  const totalWeight = evalCase.expected.reduce((sum, e) => sum + weightOf(e), 0)
  const matchedWeight = matched.reduce((sum, e) => sum + weightOf(e), 0)
  return {
    id: evalCase.id,
    name: evalCase.name,
    category: evalCase.category,
    // An empty expectation is trivially satisfied (score 1); otherwise weighted recall.
    score: totalWeight === 0 ? 1 : matchedWeight / totalWeight,
    passed: missing.length === 0,
    matched,
    missing,
  }
}

export interface CategorySummary {
  readonly cases: number
  readonly passed: number
  readonly passRate: number
  readonly meanScore: number
}

export interface SuiteSummary {
  readonly cases: number
  readonly passed: number
  /** Fraction of cases fully solved. */
  readonly passRate: number
  /** Mean weighted-recall score across cases — the partial-credit accuracy number. */
  readonly meanScore: number
  readonly byCategory: Record<string, CategorySummary>
}

const summarizeGroup = (results: ReadonlyArray<CaseResult>): CategorySummary => {
  const cases = results.length
  const passed = results.filter((r) => r.passed).length
  const meanScore = cases === 0 ? 0 : results.reduce((sum, r) => sum + r.score, 0) / cases
  return { cases, passed, passRate: cases === 0 ? 0 : passed / cases, meanScore }
}

/** Aggregate case results into an overall and per-category accuracy report. */
export const summarizeSuite = (results: ReadonlyArray<CaseResult>): SuiteSummary => {
  const byCategory: Record<string, CategorySummary> = {}
  const categories = [...new Set(results.map((r) => r.category))]
  for (const category of categories) byCategory[category] = summarizeGroup(results.filter((r) => r.category === category))
  const overall = summarizeGroup(results)
  return {
    cases: overall.cases,
    passed: overall.passed,
    passRate: overall.passRate,
    meanScore: overall.meanScore,
    byCategory,
  }
}

/** Render a suite summary as a compact, human-readable report. */
export const renderSummary = (summary: SuiteSummary): string => {
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`
  const lines = [
    `Eval suite: ${summary.passed}/${summary.cases} solved (${pct(summary.passRate)}), mean score ${pct(summary.meanScore)}`,
  ]
  for (const [category, s] of Object.entries(summary.byCategory).sort())
    lines.push(`  ${category}: ${s.passed}/${s.cases} solved (${pct(s.passRate)}), mean ${pct(s.meanScore)}`)
  return lines.join("\n")
}
