import { TechniqueParse } from "./parse"
import type { Parsed } from "./asset"

/**
 * The technique tools' shared spec list — Impactr's "hands", wrapping proven engines (subfinder,
 * httpx, nuclei, …) behind one shared scaffold: run the engine, parse its output with the shared
 * core parsers, and ingest the normalized assets into the Attack Graph. Kept here as the single
 * source of truth so the CLI and hosted tool wrappers can never drift on which techniques exist or
 * what arguments they build.
 */

export interface TechniqueOptions {
  readonly wordlist?: "common" | "medium" | "big" | "raft"
  readonly extensions?: string
  readonly ports?: string
  readonly depth?: number
  readonly severity?: string
  readonly tags?: string
}

export interface Spec {
  readonly name: string
  readonly engine: string
  readonly description: string
  readonly buildArgs: (target: string, opts: TechniqueOptions) => ReadonlyArray<string>
  readonly parse: (stdout: string) => Parsed
}

const WORDLISTS: Record<NonNullable<TechniqueOptions["wordlist"]>, string> = {
  common: "/usr/share/seclists/Discovery/Web-Content/common.txt",
  medium: "/usr/share/seclists/Discovery/Web-Content/directory-list-2.3-medium.txt",
  big: "/usr/share/seclists/Discovery/Web-Content/big.txt",
  raft: "/usr/share/seclists/Discovery/Web-Content/raft-large-directories.txt",
}

/** Translate the friendly `ports` option into naabu flags; empty = naabu's default (top 100). */
const portArgs = (ports?: string): ReadonlyArray<string> => {
  if (!ports) return []
  if (ports === "full") return ["-p", "-"]
  if (ports === "top-1000") return ["-top-ports", "1000"]
  if (ports === "top-100") return ["-top-ports", "100"]
  if (/^[\d,-]+$/.test(ports.replace(/\s+/g, ""))) return ["-p", ports.replace(/\s+/g, "")]
  return []
}

export const techniqueSpecs: ReadonlyArray<Spec> = [
  {
    name: "enumerate_subdomains",
    engine: "subfinder",
    description: "Enumerate subdomains of a root domain (passive + active). Target: a domain.",
    buildArgs: (t) => ["-silent", "-json", "-d", t],
    parse: TechniqueParse.subfinder,
  },
  {
    name: "resolve_dns",
    engine: "dnsx",
    description: "Resolve a host's DNS records (A/AAAA/CNAME). Target: a hostname.",
    buildArgs: (t) => ["-silent", "-json", "-a", "-aaaa", "-cname", "-d", t],
    parse: TechniqueParse.dnsx,
  },
  {
    name: "scan_ports",
    engine: "naabu",
    description:
      "Discover open ports and services on a host. Target: a host or IP. Option: ports ('top-100' default, 'top-1000', 'full', or a list like '80,443,6379').",
    buildArgs: (t, o) => ["-silent", "-json", ...portArgs(o.ports), "-host", t],
    parse: TechniqueParse.naabu,
  },
  {
    name: "probe_http",
    engine: "httpx",
    description: "Probe HTTP(S): liveness, status, title, tech, server. Target: a host or URL. First hand for a web target.",
    buildArgs: (t) => ["-silent", "-json", "-title", "-tech-detect", "-status-code", "-web-server", "-u", t],
    parse: TechniqueParse.httpx,
  },
  {
    name: "crawl_site",
    engine: "katana",
    description: "Actively crawl a live site for reachable endpoints. Target: a URL. Option: depth (crawl depth).",
    buildArgs: (t, o) => ["-silent", "-json", ...(o.depth ? ["-depth", String(o.depth)] : []), "-u", t],
    parse: TechniqueParse.katana,
  },
  {
    name: "harvest_urls",
    engine: "gau",
    description: "Collect historical URLs from archives (endpoints linked once). Target: a domain.",
    buildArgs: (t) => [t],
    parse: TechniqueParse.urlList,
  },
  {
    name: "discover_content",
    engine: "ffuf",
    description:
      "Brute-force unlinked content (backups, admin, .git). Target: a base URL (FUZZ is appended). Options: wordlist ('common' default, 'medium', 'big', 'raft'), extensions (e.g. '.bak,.old,.git,.env').",
    buildArgs: (t, o) => [
      "-s",
      "-json",
      "-w",
      WORDLISTS[o.wordlist ?? "common"],
      ...(o.extensions ? ["-e", o.extensions] : []),
      "-u",
      `${t.replace(/\/$/, "")}/FUZZ`,
    ],
    parse: TechniqueParse.ffuf,
  },
  {
    name: "scan_vulnerabilities",
    engine: "nuclei",
    description:
      "Scan a live target for known vulnerabilities, CVEs, misconfigurations, and exposures with nuclei; findings land in the attack graph as severity-scored vulnerability nodes linked to the affected asset. Target: a URL or host. Options: severity (e.g. 'critical,high'; default 'critical,high,medium'), tags (e.g. 'cve,rce,exposure').",
    buildArgs: (t, o) => [
      "-jsonl",
      "-silent",
      "-nc",
      "-severity",
      o.severity ?? "critical,high,medium",
      ...(o.tags ? ["-tags", o.tags] : []),
      "-u",
      t,
    ],
    parse: TechniqueParse.nuclei,
  },
  {
    name: "discover_api_spec",
    engine: "curl",
    description: "Fetch and parse an OpenAPI/Swagger spec into per-operation endpoints. Target: the spec URL.",
    buildArgs: (t) => ["-s", "-L", "--max-time", "30", t],
    parse: TechniqueParse.openapi,
  },
  {
    name: "analyze_javascript",
    engine: "curl",
    description: "Fetch a JavaScript file and extract hidden endpoints and leaked secrets. Target: the .js URL.",
    buildArgs: (t) => ["-s", "-L", "--max-time", "30", t],
    parse: TechniqueParse.javascript,
  },
  {
    name: "mine_parameters",
    engine: "arjun",
    description: "Discover hidden request parameters on an endpoint, enriching it in the graph. Target: a URL.",
    buildArgs: (t) => ["-u", t, "-oJ", "/dev/stdout", "-q"],
    parse: TechniqueParse.arjun,
  },
]
