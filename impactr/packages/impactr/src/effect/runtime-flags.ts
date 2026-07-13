import { Config, ConfigProvider, Context, Effect, Layer, Option } from "effect"
import { ConfigService } from "@/effect/config-service"

const bool = (name: string) => Config.boolean(name).pipe(Config.withDefault(false))
const positiveInteger = (name: string) =>
  Config.number(name).pipe(
    Config.map((value) => (Number.isInteger(value) && value > 0 ? value : undefined)),
    Config.orElse(() => Config.succeed(undefined)),
  )
const experimental = bool("IMPACTR_EXPERIMENTAL")
const enabledByExperimental = (name: string) =>
  Config.all({ experimental, enabled: Config.boolean(name).pipe(Config.option) }).pipe(
    Config.map((flags) => Option.getOrElse(flags.enabled, () => flags.experimental)),
  )

export class Service extends ConfigService.Service<Service>()("@impactr/RuntimeFlags", {
  autoShare: bool("IMPACTR_AUTO_SHARE"),
  pure: bool("IMPACTR_PURE"),
  disableDefaultPlugins: bool("IMPACTR_DISABLE_DEFAULT_PLUGINS"),
  disableEmbeddedWebUi: bool("IMPACTR_DISABLE_EMBEDDED_WEB_UI"),
  disableExternalSkills: bool("IMPACTR_DISABLE_EXTERNAL_SKILLS"),
  disableLspDownload: bool("IMPACTR_DISABLE_LSP_DOWNLOAD"),
  disableClaudeCodePrompt: Config.all({
    broad: bool("IMPACTR_DISABLE_CLAUDE_CODE"),
    direct: bool("IMPACTR_DISABLE_CLAUDE_CODE_PROMPT"),
  }).pipe(Config.map((flags) => flags.broad || flags.direct)),
  disableClaudeCodeSkills: Config.all({
    broad: bool("IMPACTR_DISABLE_CLAUDE_CODE"),
    direct: bool("IMPACTR_DISABLE_CLAUDE_CODE_SKILLS"),
  }).pipe(Config.map((flags) => flags.broad || flags.direct)),
  enableExa: Config.all({
    experimental,
    enabled: bool("IMPACTR_ENABLE_EXA"),
    legacy: bool("IMPACTR_EXPERIMENTAL_EXA"),
  }).pipe(Config.map((flags) => flags.experimental || flags.enabled || flags.legacy)),
  enableParallel: Config.all({
    enabled: bool("IMPACTR_ENABLE_PARALLEL"),
    legacy: bool("IMPACTR_EXPERIMENTAL_PARALLEL"),
  }).pipe(Config.map((flags) => flags.enabled || flags.legacy)),
  enableExperimentalModels: bool("IMPACTR_ENABLE_EXPERIMENTAL_MODELS"),
  enableQuestionTool: bool("IMPACTR_ENABLE_QUESTION_TOOL"),
  experimentalReferences: enabledByExperimental("IMPACTR_EXPERIMENTAL_REFERENCES"),
  experimentalBackgroundSubagents: enabledByExperimental("IMPACTR_EXPERIMENTAL_BACKGROUND_SUBAGENTS"),
  experimentalLspTy: bool("IMPACTR_EXPERIMENTAL_LSP_TY"),
  experimentalLspTool: enabledByExperimental("IMPACTR_EXPERIMENTAL_LSP_TOOL"),
  experimentalOxfmt: enabledByExperimental("IMPACTR_EXPERIMENTAL_OXFMT"),
  experimentalPlanMode: enabledByExperimental("IMPACTR_EXPERIMENTAL_PLAN_MODE"),
  experimentalEventSystem: enabledByExperimental("IMPACTR_EXPERIMENTAL_EVENT_SYSTEM"),
  experimentalWorkspaces: enabledByExperimental("IMPACTR_EXPERIMENTAL_WORKSPACES"),
  experimentalIconDiscovery: enabledByExperimental("IMPACTR_EXPERIMENTAL_ICON_DISCOVERY"),
  outputTokenMax: positiveInteger("IMPACTR_EXPERIMENTAL_OUTPUT_TOKEN_MAX"),
  bashDefaultTimeoutMs: positiveInteger("IMPACTR_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS"),
  experimentalNativeLlm: bool("IMPACTR_EXPERIMENTAL_NATIVE_LLM"),
  experimentalWebSockets: bool("IMPACTR_EXPERIMENTAL_WEBSOCKETS"),
  client: Config.string("IMPACTR_CLIENT").pipe(Config.withDefault("cli")),
}) {}

export type Info = Context.Service.Shape<typeof Service>

const emptyConfigLayer = Service.layer.pipe(
  Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({}))),
  Layer.orDie,
)

export const layer = (overrides: Partial<Info> = {}) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const flags = yield* Service
      return Service.of({ ...flags, ...overrides })
    }),
  ).pipe(Layer.provide(emptyConfigLayer))

export const node = LayerNode.make({ service: Service, layer: Service.layer.pipe(Layer.orDie), deps: [] })

export * as RuntimeFlags from "./runtime-flags"
import { LayerNode } from "@impactr-ai/core/effect/layer-node"
