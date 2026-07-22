import { describe, expect, test } from "bun:test"
import fs from "fs"
import path from "path"
import os from "os"
import { RunDirectory } from "../../src/cli/run-directory"

describe("RunDirectory.resolveRunDirectory", () => {
  test("mints a fresh isolated engagement directory when no --dir and not resuming", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "impactr-run-dir-"))
    const resolved = RunDirectory.resolveRunDirectory(undefined, cwd)
    expect(resolved).not.toBe(cwd)
    expect(fs.existsSync(resolved)).toBe(true)
  })

  test("falls back to the launch cwd when resuming (--continue/--session) with no --dir", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "impactr-run-dir-"))
    const resolved = RunDirectory.resolveRunDirectory(undefined, cwd, { preferCwd: true })
    expect(resolved).toBe(cwd)
  })

  test("an explicit --dir wins over resuming", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "impactr-run-dir-"))
    const explicit = fs.mkdtempSync(path.join(os.tmpdir(), "impactr-run-dir-explicit-"))
    const resolved = RunDirectory.resolveRunDirectory(explicit, cwd, { preferCwd: true })
    expect(resolved).toBe(explicit)
  })
})
