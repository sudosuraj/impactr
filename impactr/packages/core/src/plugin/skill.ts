/// <reference path="../markdown.d.ts" />

export * as SkillPlugin from "./skill"

import { define } from "./internal"
import { Effect } from "effect"
import { AbsolutePath } from "../schema"
import { SkillV2 } from "../skill"
import customizeImpactrContent from "./skill/customize-impactr.md" with { type: "text" }

export const CustomizeImpactrContent = customizeImpactrContent

export const Plugin = define({
  id: "skill",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.skill.transform((draft) => {
      draft.source(
        SkillV2.EmbeddedSource.make({
          type: "embedded",
          skill: SkillV2.Info.make({
            name: "customize-impactr",
            description:
              "Use ONLY when the user is editing or creating impactr's own configuration: impactr.json, impactr.jsonc, files under .impactr/, or files under ~/.config/impactr/. Also use when creating or fixing impactr agents, subagents, commands, skills, plugins, MCP servers, or permission rules. Do not use for the user's own application code, or for any project that is not configuring impactr itself.",
            location: AbsolutePath.make("/builtin/customize-impactr.md"),
            content: CustomizeImpactrContent,
          }),
        }),
      )
    })
  }),
})
