import { run as runTui, type TuiInput } from "@impactr-ai/tui"
import { Global } from "@impactr-ai/core/global"
import { AppNodeBuilder } from "@impactr-ai/core/effect/app-node-builder"
import { Effect } from "effect"

export function run(input: TuiInput) {
  return runTui(input).pipe(Effect.provide(AppNodeBuilder.build(Global.node)))
}
