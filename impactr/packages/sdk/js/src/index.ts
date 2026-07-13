export * from "./client.js"
export * from "./server.js"

import { createImpactrClient } from "./client.js"
import { createImpactrServer } from "./server.js"
import type { ServerOptions } from "./server.js"

export async function createImpactr(options?: ServerOptions) {
  const server = await createImpactrServer({
    ...options,
  })

  const client = createImpactrClient({
    baseUrl: server.url,
  })

  return {
    client,
    server,
  }
}
