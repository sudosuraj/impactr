import type { ObjectiveTree } from "./plan"

/**
 * Starting methodologies Impactr can seed its plan of attack from. A human hacker never starts
 * from a blank page — they open with a mental checklist shaped by the target type, then adapt it
 * to what they find. These playbooks are that checklist: prioritized objective hierarchies the
 * agent seeds once it has oriented (picked the archetype that fits the target), and then
 * reprioritizes, revises, and extends. Seeds, not rails.
 *
 * Priorities encode value-weighted attention — where impactful bugs most often live — so the
 * engine works auth/access-control/injection before boilerplate. Titles are technique-agnostic
 * objectives, not tool invocations, so they stay valid as the technique tools evolve.
 */

export type PlaybookName = "web-app" | "api" | "external-network"

const webApp: ReadonlyArray<ObjectiveTree> = [
  {
    title: "Map the attack surface",
    priority: 0.7,
    rationale: "You cannot test what you cannot see; enumerate before you attack.",
    children: [
      { title: "Enumerate subdomains and live hosts", priority: 0.7 },
      { title: "Crawl the app and harvest historical URLs", priority: 0.65 },
      { title: "Discover unlinked content (backups, .git/.env, admin panels)", priority: 0.7 },
      { title: "Analyze client-side JavaScript for hidden endpoints, params, and secrets", priority: 0.75, rationale: "Modern SPAs hide the real API surface in their JS." },
      { title: "Fingerprint the tech stack and versions", priority: 0.6 },
    ],
  },
  {
    title: "Test authentication and session management",
    priority: 0.9,
    rationale: "Auth is where impact concentrates: a bypass owns every account.",
    children: [
      { title: "Try default/weak credentials and check for auth bypass", priority: 0.9 },
      { title: "Probe session handling and JWT weaknesses (alg:none, weak secret, no expiry)", priority: 0.8 },
      { title: "Test the password-reset and account-recovery flows", priority: 0.75 },
    ],
  },
  {
    title: "Test access control (IDOR / privilege escalation)",
    priority: 0.9,
    rationale: "Broken access control is the most common high-impact web bug.",
    children: [
      { title: "Test object references for IDOR across users/tenants", priority: 0.9 },
      { title: "Attempt horizontal and vertical privilege escalation", priority: 0.85 },
      { title: "Force-browse to admin/privileged functions", priority: 0.75 },
    ],
  },
  {
    title: "Probe injection points on discovered parameters",
    priority: 0.8,
    children: [
      { title: "Test for SQL injection", priority: 0.8 },
      { title: "Test for XSS (reflected, stored, DOM)", priority: 0.75 },
      { title: "Test for SSTI and command injection", priority: 0.7 },
    ],
  },
  {
    title: "Test file upload and server-side request handling",
    priority: 0.75,
    children: [
      { title: "Attempt unrestricted file upload toward code execution", priority: 0.75 },
      { title: "Test URL-fetch/import features for SSRF (target cloud metadata)", priority: 0.8, rationale: "SSRF to metadata endpoints yields cloud credentials — a classic chain." },
      { title: "Test for path traversal", priority: 0.65 },
    ],
  },
  {
    title: "Check for known vulnerabilities and misconfigurations",
    priority: 0.7,
    children: [
      { title: "Look up CVEs for fingerprinted components and versions", priority: 0.7 },
      { title: "Check security headers, CORS, and cookie flags", priority: 0.5 },
    ],
  },
  {
    title: "Test business logic and sensitive data exposure",
    priority: 0.6,
    children: [
      { title: "Test rate limiting and anti-automation on sensitive actions", priority: 0.55 },
      { title: "Test price/quantity/workflow tampering", priority: 0.6 },
      { title: "Hunt for information disclosure (verbose errors, debug endpoints, secrets)", priority: 0.6 },
    ],
  },
]

const api: ReadonlyArray<ObjectiveTree> = [
  {
    title: "Discover the API surface",
    priority: 0.8,
    children: [
      { title: "Find the API spec (OpenAPI/Swagger) or GraphQL introspection", priority: 0.8 },
      { title: "Enumerate endpoints, methods, and required parameters", priority: 0.75 },
      { title: "Mine for hidden/undocumented parameters", priority: 0.65 },
    ],
  },
  {
    title: "Test object-level authorization (BOLA / IDOR)",
    priority: 0.95,
    rationale: "Broken object-level authorization is the #1 API vulnerability.",
    children: [
      { title: "Swap object IDs across accounts/tenants and check enforcement", priority: 0.95 },
    ],
  },
  {
    title: "Test authentication",
    priority: 0.85,
    children: [
      { title: "Test for broken authentication and token handling", priority: 0.85 },
      { title: "Test JWT/API-key weaknesses", priority: 0.8 },
    ],
  },
  {
    title: "Test function-level authorization",
    priority: 0.8,
    children: [{ title: "Attempt privileged/admin operations as a low-privilege caller", priority: 0.8 }],
  },
  {
    title: "Test mass assignment and input validation",
    priority: 0.75,
    children: [
      { title: "Inject unexpected/privileged fields into request bodies", priority: 0.75 },
      { title: "Test injection and SSRF on API parameters", priority: 0.7 },
    ],
  },
  {
    title: "Test rate limiting and resource consumption",
    priority: 0.55,
    children: [{ title: "Check for unrestricted resource consumption / missing rate limits", priority: 0.55 }],
  },
]

const externalNetwork: ReadonlyArray<ObjectiveTree> = [
  {
    title: "Enumerate hosts and services",
    priority: 0.8,
    children: [
      { title: "Enumerate subdomains and resolve to hosts", priority: 0.8 },
      { title: "Scan for open ports and running services", priority: 0.8 },
    ],
  },
  {
    title: "Fingerprint services and versions",
    priority: 0.75,
    children: [{ title: "Identify service versions and look up known CVEs", priority: 0.75 }],
  },
  {
    title: "Check exposed and administrative services",
    priority: 0.85,
    rationale: "Exposed databases, admin panels, and default creds are fast high-impact wins.",
    children: [
      { title: "Look for exposed databases, dashboards, and admin interfaces", priority: 0.85 },
      { title: "Try default and weak credentials on exposed services", priority: 0.8 },
    ],
  },
  {
    title: "Test for known vulnerabilities",
    priority: 0.8,
    children: [{ title: "Validate CVE candidates against fingerprinted services", priority: 0.8 }],
  },
  {
    title: "Review TLS and configuration hygiene",
    priority: 0.5,
    children: [{ title: "Check TLS configuration and certificate issues", priority: 0.5 }],
  },
]

export const playbooks: Record<PlaybookName, ReadonlyArray<ObjectiveTree>> = {
  "web-app": webApp,
  api,
  "external-network": externalNetwork,
}

export const playbookNames = Object.keys(playbooks) as PlaybookName[]
