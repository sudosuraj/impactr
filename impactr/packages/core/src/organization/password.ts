export * as Password from "./password"

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto"

/**
 * node:crypto's scrypt rather than Bun.password: hashes are created by an operator-run Bun
 * script (packages/core/script/provision-client.ts) but verified from packages/dashboard,
 * which may run inside a sandboxed server runtime (e.g. nitro's dev-worker) where the global
 * `Bun` is not defined even though the outer process is Bun. node:crypto is portable across
 * both, and across Bun/Node/nitro's sandbox in production too.
 */
const KEY_LENGTH = 64

export async function hash(password: string): Promise<string> {
  const salt = randomBytes(16)
  const derived = scryptSync(password, salt, KEY_LENGTH)
  return `${salt.toString("hex")}:${derived.toString("hex")}`
}

export async function verify(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":")
  if (!saltHex || !hashHex) return false
  const salt = Buffer.from(saltHex, "hex")
  const expected = Buffer.from(hashHex, "hex")
  const actual = scryptSync(password, salt, KEY_LENGTH)
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}
