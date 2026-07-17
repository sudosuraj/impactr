import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { Database } from "@impactr-ai/core/database/database"
import { LayerNode } from "@impactr-ai/core/effect/layer-node"
import { AppNodeBuilder } from "@impactr-ai/core/effect/app-node-builder"
import { AttackGraph, node as AttackGraphNode } from "@impactr-ai/core/attack-graph/graph"
import { TechniqueParse } from "@impactr-ai/core/technique/parse"
import { TechniqueIngest } from "@impactr-ai/core/technique/ingest"
import { Project } from "@impactr-ai/core/project"
import { ProjectTable } from "@impactr-ai/core/project/sql"
import { AbsolutePath } from "@impactr-ai/core/schema"
import { SessionV2 } from "@impactr-ai/core/session"
import { SessionTable } from "@impactr-ai/core/session/sql"
import { testEffect } from "./lib/effect"

describe("TechniqueParse", () => {
  test("subfinder parses both plain lines and json", () => {
    const plain = TechniqueParse.subfinder("api.example.com\nwww.example.com\n")
    expect(plain.assets.map((a) => a.label).sort()).toEqual(["api.example.com", "www.example.com"])
    const json = TechniqueParse.subfinder('{"host":"cdn.example.com","source":"crtsh"}')
    expect(json.assets[0]).toMatchObject({ type: "subdomain", label: "cdn.example.com", id: "subdomain:cdn.example.com" })
  })

  test("dnsx maps resolutions to ip assets and resolves_to edges", () => {
    const parsed = TechniqueParse.dnsx('{"host":"api.example.com","a":["1.2.3.4"],"cname":["cdn.example.com"]}')
    expect(parsed.assets.some((a) => a.type === "ip" && a.label === "1.2.3.4")).toBe(true)
    expect(parsed.relations).toContainEqual({ source: "subdomain:api.example.com", target: "ip:1.2.3.4", relation: "resolves_to" })
  })

  test("naabu parses json and plain host:port", () => {
    const json = TechniqueParse.naabu('{"ip":"1.2.3.4","port":443}')
    expect(json.assets.some((a) => a.type === "port" && a.label === "1.2.3.4:443")).toBe(true)
    expect(json.relations).toContainEqual({ source: "ip:1.2.3.4", target: "port:1.2.3.4:443", relation: "exposes" })
    const plain = TechniqueParse.naabu("5.6.7.8:22")
    expect(plain.assets.some((a) => a.id === "port:5.6.7.8:22")).toBe(true)
  })

  test("httpx captures status, title, tech and links to its host", () => {
    const parsed = TechniqueParse.httpx(
      '{"url":"https://api.example.com","input":"api.example.com","status_code":200,"title":"API","tech":["nginx","php"]}',
    )
    const endpoint = parsed.assets.find((a) => a.type === "endpoint")
    expect(endpoint?.attributes).toMatchObject({ status: 200, title: "API", tech: ["nginx", "php"] })
    expect(parsed.relations).toContainEqual({ source: "subdomain:api.example.com", target: "endpoint:https://api.example.com", relation: "exposes" })
  })

  test("katana and urlList collect endpoint urls", () => {
    expect(TechniqueParse.katana('{"endpoint":"https://x/a"}\nhttps://x/b').assets.map((a) => a.label).sort()).toEqual([
      "https://x/a",
      "https://x/b",
    ])
    const archived = TechniqueParse.urlList("https://x/old\n")
    expect(archived.assets[0].attributes).toMatchObject({ source: "archive" })
  })

  test("ffuf extracts discovered paths from its results array", () => {
    const parsed = TechniqueParse.ffuf('{"results":[{"url":"https://x/admin","status":200,"length":42}]}')
    expect(parsed.assets[0]).toMatchObject({ type: "endpoint", label: "https://x/admin" })
    expect(parsed.assets[0].attributes).toMatchObject({ status: 200, source: "content-discovery" })
  })

  test("openapi expands paths and methods into endpoints", () => {
    const parsed = TechniqueParse.openapi(
      JSON.stringify({ servers: [{ url: "https://api.x" }], paths: { "/users/{id}": { get: {}, delete: {} }, "/login": { post: {} } } }),
    )
    expect(parsed.assets.map((a) => a.label).sort()).toEqual([
      "DELETE https://api.x/users/{id}",
      "GET https://api.x/users/{id}",
      "POST https://api.x/login",
    ])
  })

  test("javascript extracts endpoints and leaked secrets, skipping static assets", () => {
    const source = `fetch("/api/v1/orders"); const img = "/logo.png"; const key = "AKIAIOSFODNN7EXAMPLE";`
    const parsed = TechniqueParse.javascript(source)
    expect(parsed.assets.some((a) => a.type === "endpoint" && a.label === "/api/v1/orders")).toBe(true)
    expect(parsed.assets.some((a) => a.label === "/logo.png")).toBe(false)
    expect(parsed.assets.some((a) => a.type === "credential" && String((a.attributes as any).kind) === "aws-access-key")).toBe(true)
  })
})

const sessionID = SessionV2.ID.make("ses_technique_test")
const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, AttackGraphNode])))

describe("TechniqueIngest over a real Attack Graph", () => {
  it.effect("upserts parsed assets and relations, reporting new-vs-known", () =>
    Effect.gen(function* () {
      const { db } = yield* Database.Service
      yield* db.insert(ProjectTable).values({ id: Project.ID.global, worktree: AbsolutePath.make("/project"), sandboxes: [] }).run().pipe(Effect.orDie)
      yield* db
        .insert(SessionTable)
        .values({ id: sessionID, project_id: Project.ID.global, slug: "tech", directory: "/project", title: "tech", version: "test" })
        .run()
        .pipe(Effect.orDie)
      const graph = yield* AttackGraph

      const parsed = TechniqueParse.dnsx('{"host":"api.example.com","a":["1.2.3.4"]}')
      const first = yield* TechniqueIngest.ingest(graph, sessionID, parsed)
      expect(first.created).toBe(2) // subdomain + ip
      expect(first.relations).toBe(1)
      expect(first.digest).toContain("2 new")

      // Re-ingesting the same output is idempotent — dedup, nothing new created.
      const second = yield* TechniqueIngest.ingest(graph, sessionID, parsed)
      expect(second.created).toBe(0)
      expect(second.digest).toContain("0 new")

      const state = yield* graph.getGraph(sessionID)
      expect(Object.keys(state.nodes)).toContain("ip:1.2.3.4")
      expect(state.edges).toContainEqual({ source: "subdomain:api.example.com", target: "ip:1.2.3.4", relation: "resolves_to", attributes: {} })
    }),
  )
})
