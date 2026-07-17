import type { EvalCase } from "./harness"

/**
 * Example eval cases, illustrating the format. These are shape references, not a real benchmark —
 * a benchmark adapter (see docs/evaluation.md) generates cases from CyBench / NYU-CTF challenges or
 * a private range, mapping each challenge's expected result to `expected` findings.
 */
export const examples: ReadonlyArray<EvalCase> = [
  {
    id: "example-web-idor",
    name: "IDOR on the orders API",
    category: "web",
    expected: [
      { type: "vulnerability", contains: "idor", weight: 2, label: "IDOR on /api/orders/:id" },
      { type: "endpoint", contains: "/api/orders", label: "orders endpoint discovered" },
    ],
  },
  {
    id: "example-ctf-flag",
    name: "Retrieve the flag",
    category: "ctf",
    expected: [{ type: "flag", contains: "flag{", label: "captured flag" }],
  },
]
