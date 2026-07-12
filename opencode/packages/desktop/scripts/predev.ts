import { $ } from "bun"

await $`bun ./scripts/copy-icons.ts ${process.env.IMPACTR_CHANNEL ?? "dev"}`

await $`cd ../impactr && bun script/build-node.ts`
