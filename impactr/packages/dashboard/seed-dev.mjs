// Dev-only seed: builds the hosted schema in a local SQLite file and fills it with
// sample engagement data so the dashboard is fully explorable without a live agent run.
// Run from packages/dashboard:  bun seed-dev.mjs
import { createClient } from "@libsql/client"
import { randomBytes, scryptSync } from "node:crypto"

const url = process.env.DATABASE_URL ?? "file:./dev.db"
const db = createClient({ url })

// Mirror packages/core/src/organization/password.ts so the dashboard login verifies.
function hashPassword(password) {
  const salt = randomBytes(16)
  const derived = scryptSync(password, salt, 64)
  return `${salt.toString("hex")}:${derived.toString("hex")}`
}

const id = (p) => `${p}_${randomBytes(8).toString("hex")}`
const now = Date.now()
const HOUR = 3_600_000

// ---- credentials -----------------------------------------------------------
const LOGIN_EMAIL = "demo@impactr.dev"
const LOGIN_PASSWORD = "impactr"

// ---- reset + schema (bootstrap + password_hash + audit_log migrations) ------
const drops = [
  "engagement_audit_log", "hypothesis_queue", "graph_edge", "graph_node",
  "attack_graph_edge", "attack_graph_node", "finding", "asm_asset",
  "engagement", "membership", "user", "organization",
]
for (const t of drops) await db.execute(`DROP TABLE IF EXISTS \`${t}\``)

const schema = [
  `CREATE TABLE organization (id text PRIMARY KEY, name text NOT NULL, slug text NOT NULL UNIQUE, time_created integer NOT NULL, time_updated integer NOT NULL)`,
  `CREATE TABLE user (id text PRIMARY KEY, email text NOT NULL UNIQUE, name text NOT NULL, time_created integer NOT NULL, time_updated integer NOT NULL, password_hash text NOT NULL DEFAULT '')`,
  `CREATE TABLE membership (organization_id text NOT NULL, user_id text NOT NULL, role text NOT NULL, time_created integer NOT NULL, time_updated integer NOT NULL, PRIMARY KEY (organization_id, user_id))`,
  `CREATE TABLE engagement (id text PRIMARY KEY, organization_id text NOT NULL, name text NOT NULL, status text NOT NULL, scope text NOT NULL, authorized_by text, authorized_at integer, time_created integer NOT NULL, time_updated integer NOT NULL)`,
  `CREATE TABLE asm_asset (id text PRIMARY KEY, engagement_id text NOT NULL, type text NOT NULL, value text NOT NULL, attributes text NOT NULL, discovered_at integer NOT NULL, time_created integer NOT NULL, time_updated integer NOT NULL)`,
  `CREATE TABLE finding (id text PRIMARY KEY, session_id text NOT NULL, engagement_id text NOT NULL, title text NOT NULL, description text NOT NULL, cvss text NOT NULL, impact text NOT NULL, remediation text NOT NULL, status text NOT NULL, severity text NOT NULL, assigned_to text, time_created integer NOT NULL, time_updated integer NOT NULL)`,
  `CREATE TABLE attack_graph_node (engagement_id text NOT NULL, session_id text NOT NULL, id text NOT NULL, type text NOT NULL, label text NOT NULL, attributes text NOT NULL, status text NOT NULL, discovered_at integer NOT NULL, loop_count integer DEFAULT 0 NOT NULL, PRIMARY KEY (engagement_id, id))`,
  `CREATE TABLE attack_graph_edge (engagement_id text NOT NULL, session_id text NOT NULL, source text NOT NULL, target text NOT NULL, relation text NOT NULL, attributes text NOT NULL, PRIMARY KEY (engagement_id, source, target, relation))`,
  `CREATE TABLE hypothesis_queue (id text PRIMARY KEY, engagement_id text NOT NULL, session_id text NOT NULL, source_finding_id text NOT NULL, description text NOT NULL, priority real NOT NULL, status text NOT NULL DEFAULT 'pending', time_created integer NOT NULL, time_updated integer NOT NULL)`,
  `CREATE TABLE engagement_audit_log (id text PRIMARY KEY, engagement_id text NOT NULL, actor_user_id text, action text NOT NULL, details text, time_created integer NOT NULL)`,
]
for (const stmt of schema) await db.execute(stmt)

// ---- tenant + login --------------------------------------------------------
const orgID = id("org")
const userID = id("usr")
const sessionID = id("ses")
await db.execute({
  sql: `INSERT INTO organization (id, name, slug, time_created, time_updated) VALUES (?,?,?,?,?)`,
  args: [orgID, "Acme Security", "acme", now, now],
})
await db.execute({
  sql: `INSERT INTO user (id, email, name, time_created, time_updated, password_hash) VALUES (?,?,?,?,?,?)`,
  args: [userID, LOGIN_EMAIL, "Demo Analyst", now, now, hashPassword(LOGIN_PASSWORD)],
})
await db.execute({
  sql: `INSERT INTO membership (organization_id, user_id, role, time_created, time_updated) VALUES (?,?,?,?,?)`,
  args: [orgID, userID, "owner", now, now],
})

// ---- engagements -----------------------------------------------------------
const engActive = id("eng")
const engScheduled = id("eng")
const engDone = id("eng")
const scope = (name, s, ex = []) => JSON.stringify({ target: { name, scope: s, exclusions: ex } })
const engagements = [
  [engActive, "Acme Q3 External", "active", scope("Acme", "*.acme.test", ["blog.acme.test"]), userID, now - 6 * HOUR, now - 6 * HOUR],
  [engScheduled, "Acme Internal Network", "authorized", scope("Acme Internal", "10.0.0.0/16"), userID, now - 2 * HOUR, now - 2 * HOUR],
  [engDone, "Acme Q2 External (closed)", "completed", scope("Acme", "*.acme.test"), userID, now - 40 * 24 * HOUR, now - 40 * 24 * HOUR],
]
for (const [eid, name, status, sc, by, created, auth] of engagements) {
  await db.execute({
    sql: `INSERT INTO engagement (id, organization_id, name, status, scope, authorized_by, authorized_at, time_created, time_updated) VALUES (?,?,?,?,?,?,?,?,?)`,
    args: [eid, orgID, name, status, sc, by, auth, created, created],
  })
}

// ---- assets (attack surface; some within the last hour for "new") ----------
const assets = [
  ["subdomain", "www.acme.test", 5.5], ["subdomain", "api.acme.test", 5.2],
  ["subdomain", "vpn.acme.test", 4.0], ["subdomain", "staging.acme.test", 3.0],
  ["subdomain", "mail.acme.test", 2.5], ["ip", "203.0.113.10", 5.0],
  ["ip", "203.0.113.20", 3.5], ["port", "203.0.113.10:443", 2.0],
  ["port", "203.0.113.20:22", 1.5], ["endpoint", "https://api.acme.test/api/login", 0.6],
  ["endpoint", "https://api.acme.test/api/users", 0.4], ["endpoint", "https://staging.acme.test/admin", 0.2],
]
for (const [type, value, hoursAgo] of assets) {
  const t = Math.round(now - hoursAgo * HOUR)
  await db.execute({
    sql: `INSERT INTO asm_asset (id, engagement_id, type, value, attributes, discovered_at, time_created, time_updated) VALUES (?,?,?,?,?,?,?,?)`,
    args: [id("ast"), engActive, type, value, JSON.stringify({ source: "recon" }), t, t, t],
  })
}

// ---- findings --------------------------------------------------------------
const findings = [
  ["SQL injection in /api/login", "The login endpoint concatenates the `email` parameter into a SQL query. A payload of `' OR '1'='1' -- ` bypasses authentication and returns the first user row.", "9.1", "Full authentication bypass and database read access. An attacker can enumerate and exfiltrate all user records.", "Use parameterized queries / prepared statements. Add input validation and a WAF rule for SQL metacharacters.", "open", "critical", 5.9],
  ["Reused admin credentials grant VPN access", "The admin password recovered from the exposed .git history is reused on the corporate VPN portal, granting internal network access.", "8.2", "Pivot from external web app to the internal network. Establishes a foothold beyond the DMZ.", "Enforce unique credentials per system, rotate the exposed password, and require MFA on the VPN.", "open", "high", 5.2],
  ["Exposed .git directory leaks source", "https://api.acme.test/.git/ is world-readable and allows full repository reconstruction, including committed secrets.", "7.5", "Source code and historical credentials disclosure.", "Block access to dotfiles at the web server; purge secrets from history and rotate them.", "triaged", "high", 4.5],
  ["Missing security headers", "Responses lack Content-Security-Policy, X-Frame-Options, and HSTS.", "5.3", "Increased exposure to clickjacking and protocol-downgrade attacks.", "Add CSP, X-Frame-Options: DENY, and Strict-Transport-Security headers.", "open", "medium", 3.0],
  ["Verbose error messages", "Unhandled exceptions return stack traces exposing framework versions and file paths.", "4.7", "Information disclosure aiding further attacks.", "Return generic error pages; log details server-side only.", "resolved", "medium", 20 * HOUR / HOUR],
  ["TLS 1.0 supported on mail.acme.test", "The mail host still negotiates TLS 1.0.", "3.1", "Weak transport encryption susceptible to known downgrade attacks.", "Disable TLS 1.0/1.1; require TLS 1.2+.", "open", "low", 8.0],
  ["Server banner discloses version", "The HTTP Server header reveals the exact web server build.", "0.0", "Minor information disclosure.", "Suppress or genericize the Server header.", "triaged", "info", 12.0],
]
const findingIDs = []
for (const [title, description, cvss, impact, remediation, status, severity, hoursAgo] of findings) {
  const fid = id("fnd")
  findingIDs.push(fid)
  const t = Math.round(now - hoursAgo * HOUR)
  await db.execute({
    sql: `INSERT INTO finding (id, session_id, engagement_id, title, description, cvss, impact, remediation, status, severity, assigned_to, time_created, time_updated) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [fid, sessionID, engActive, title, description, cvss, impact, remediation, status, severity, null, t, t],
  })
}

// ---- attack graph ----------------------------------------------------------
const nodes = [
  ["n1", "subdomain", "www.acme.test", "enumerating", 5.5],
  ["n2", "subdomain", "api.acme.test", "exploiting", 5.2],
  ["n3", "subdomain", "vpn.acme.test", "compromised", 4.0],
  ["n4", "subdomain", "staging.acme.test", "pending", 3.0],
  ["n5", "ip", "203.0.113.10", "enumerating", 5.0],
  ["n6", "ip", "203.0.113.20", "compromised", 3.5],
  ["n7", "port", "443/tcp (https)", "exploiting", 4.8],
  ["n8", "port", "22/tcp (ssh)", "compromised", 3.4],
  ["n9", "port", "8080/tcp (http-alt)", "pending", 2.9],
  ["n10", "endpoint", "/api/login", "exploiting", 0.6],
  ["n11", "endpoint", "/api/users", "compromised", 0.4],
  ["n12", "endpoint", "/admin", "pending", 0.2],
  ["n13", "credential", "admin@acme.test (reused)", "compromised", 1.0],
  ["n14", "vulnerability", "SQLi in /api/login", "exploiting", 0.5],
  ["n15", "vulnerability", "Exposed .git directory", "compromised", 0.3],
]
for (const [nid, type, label, status, hoursAgo] of nodes) {
  const t = Math.round(now - hoursAgo * HOUR)
  await db.execute({
    sql: `INSERT INTO attack_graph_node (engagement_id, session_id, id, type, label, attributes, status, discovered_at, loop_count) VALUES (?,?,?,?,?,?,?,?,?)`,
    args: [engActive, sessionID, nid, type, label, JSON.stringify({}), status, t, 0],
  })
}
const edges = [
  ["n2", "n5", "resolves_to"], ["n5", "n7", "exposes"], ["n7", "n10", "serves"],
  ["n10", "n14", "vulnerable_to"], ["n14", "n13", "yields"], ["n13", "n3", "accesses"],
  ["n3", "n8", "exposes"], ["n1", "n6", "resolves_to"], ["n6", "n9", "exposes"],
  ["n7", "n11", "serves"], ["n11", "n15", "reveals"], ["n4", "n12", "serves"],
]
for (const [source, target, relation] of edges) {
  await db.execute({
    sql: `INSERT INTO attack_graph_edge (engagement_id, session_id, source, target, relation, attributes) VALUES (?,?,?,?,?,?)`,
    args: [engActive, sessionID, source, target, relation, JSON.stringify({})],
  })
}

// ---- hypothesis queue (working leads) --------------------------------------
const hypotheses = [
  ["Test /api/users for IDOR by iterating tenant IDs", 0.82],
  ["Attempt privilege escalation with reused admin creds on staging.acme.test", 0.76],
  ["Fuzz /admin for authentication bypass and default routes", 0.64],
  ["Check 8080/tcp staging service for default credentials", 0.55],
]
for (let i = 0; i < hypotheses.length; i++) {
  const [description, priority] = hypotheses[i]
  await db.execute({
    sql: `INSERT INTO hypothesis_queue (id, engagement_id, session_id, source_finding_id, description, priority, status, time_created, time_updated) VALUES (?,?,?,?,?,?,?,?,?)`,
    args: [id("hyp"), engActive, sessionID, findingIDs[i] ?? findingIDs[0], description, priority, "pending", now, now],
  })
}

// ---- audit log -------------------------------------------------------------
const audit = [
  [engActive, "created", { note: "Engagement opened" }, now - 6 * HOUR],
  [engActive, "authorized", { authorizedBy: "Jane, Impactr Ops" }, now - 6 * HOUR + 60000],
  [engActive, "scope_changed", { added: ["staging.acme.test"] }, now - 3 * HOUR],
  [engScheduled, "created", { note: "Internal engagement queued" }, now - 2 * HOUR],
  [engDone, "revoked", { note: "Engagement completed and closed" }, now - 39 * 24 * HOUR],
]
for (const [eid, action, details, t] of audit) {
  await db.execute({
    sql: `INSERT INTO engagement_audit_log (id, engagement_id, actor_user_id, action, details, time_created) VALUES (?,?,?,?,?,?)`,
    args: [id("aud"), eid, userID, action, JSON.stringify(details), t],
  })
}

console.log("Seed complete.")
console.log(`  Database:  ${url}`)
console.log(`  Login:     ${LOGIN_EMAIL} / ${LOGIN_PASSWORD}`)
console.log(`  Org:       Acme Security  (${orgID})`)
console.log(`  Findings:  ${findingIDs.length}   Nodes: ${nodes.length}   Edges: ${edges.length}`)
