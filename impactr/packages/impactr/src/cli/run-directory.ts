export * as RunDirectory from "./run-directory"

import fs from "fs"
import path from "path"
import { ulid } from "ulid"
import { Global } from "@impactr-ai/core/global"

function readPackageName(dir: string): string | undefined {
  try {
    const raw = fs.readFileSync(path.join(dir, "package.json"), "utf8")
    return (JSON.parse(raw) as { name?: string }).name
  } catch {
    return undefined
  }
}

// Detects Impactr's own dev checkout, so an engagement workspace can never resolve inside it.
export function isInsideImpactrSource(directory: string): boolean {
  let dir = path.resolve(directory)
  for (let i = 0; i < 64; i++) {
    if (readPackageName(dir) === "impactr") return true
    // Also catches siblings of the impactr/ app dir, e.g. the outer git root, .agents/.
    if (readPackageName(path.join(dir, "impactr")) === "impactr") return true
    const parent = path.dirname(dir)
    if (parent === dir) return false
    dir = parent
  }
  return false
}

let cachedDefault: string | undefined

// Cached so the `directory:` cmd option and the run handler's own chdir agree on one path.
function defaultEngagementDirectory(): string {
  if (cachedDefault) return cachedDefault
  const dir = path.join(Global.Path.data, "engagements", ulid())
  fs.mkdirSync(dir, { recursive: true })
  cachedDefault = dir
  return dir
}

// Explicit --dir (guarded against Impactr's own source) or a fresh isolated engagement workspace.
// `resuming` is true for `--continue`/`--session` with no explicit --dir: session lookup is scoped
// to the launch directory's project, so minting a fresh (empty) engagement directory here would make
// resumption silently fail to find the session and fall through to creating a new one instead. In
// that case, fall back to the launch cwd — the pre-workspace-isolation behavior — rather than isolating.
export function resolveRunDirectory(
  dir: string | undefined,
  cwd: string,
  allowUnsafeDir?: boolean,
  resuming?: boolean,
): string {
  if (!dir) return resuming ? cwd : defaultEngagementDirectory()
  const resolved = path.isAbsolute(dir) ? dir : path.resolve(cwd, dir)
  if (!allowUnsafeDir && isInsideImpactrSource(resolved)) {
    console.error(
      `Refusing to run against ${resolved} — it's inside Impactr's own source tree.\n` +
        `Point --dir at an isolated engagement workspace instead, or pass --allow-unsafe-dir to override.`,
    )
    process.exit(1)
  }
  return resolved
}
