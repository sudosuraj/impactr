import { Config } from "effect"

export function truthy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "true" || value === "1"
}

const copy = process.env["IMPACTR_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"]
const fff = process.env["IMPACTR_DISABLE_FFF"]

function enabledByExperimental(key: string) {
  return process.env[key] === undefined ? truthy("IMPACTR_EXPERIMENTAL") : truthy(key)
}

export const Flag = {
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env["OTEL_EXPORTER_OTLP_ENDPOINT"],
  OTEL_EXPORTER_OTLP_HEADERS: process.env["OTEL_EXPORTER_OTLP_HEADERS"],

  IMPACTR_AUTO_HEAP_SNAPSHOT: truthy("IMPACTR_AUTO_HEAP_SNAPSHOT"),
  IMPACTR_GIT_BASH_PATH: process.env["IMPACTR_GIT_BASH_PATH"],
  IMPACTR_CONFIG: process.env["IMPACTR_CONFIG"],
  IMPACTR_CONFIG_CONTENT: process.env["IMPACTR_CONFIG_CONTENT"],
  IMPACTR_DISABLE_AUTOUPDATE: truthy("IMPACTR_DISABLE_AUTOUPDATE"),
  IMPACTR_ALWAYS_NOTIFY_UPDATE: truthy("IMPACTR_ALWAYS_NOTIFY_UPDATE"),
  IMPACTR_DISABLE_PRUNE: truthy("IMPACTR_DISABLE_PRUNE"),
  IMPACTR_DISABLE_TERMINAL_TITLE: truthy("IMPACTR_DISABLE_TERMINAL_TITLE"),
  IMPACTR_SHOW_TTFD: truthy("IMPACTR_SHOW_TTFD"),
  IMPACTR_DISABLE_AUTOCOMPACT: truthy("IMPACTR_DISABLE_AUTOCOMPACT"),
  IMPACTR_DISABLE_MODELS_FETCH: truthy("IMPACTR_DISABLE_MODELS_FETCH"),
  IMPACTR_DISABLE_MOUSE: truthy("IMPACTR_DISABLE_MOUSE"),
  IMPACTR_FAKE_VCS: process.env["IMPACTR_FAKE_VCS"],
  IMPACTR_SERVER_PASSWORD: process.env["IMPACTR_SERVER_PASSWORD"],
  IMPACTR_SERVER_USERNAME: process.env["IMPACTR_SERVER_USERNAME"],
  IMPACTR_DISABLE_FFF: fff === undefined ? process.platform === "win32" : truthy("IMPACTR_DISABLE_FFF"),

  // Experimental
  IMPACTR_EXPERIMENTAL_FILEWATCHER: Config.boolean("IMPACTR_EXPERIMENTAL_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),
  IMPACTR_EXPERIMENTAL_DISABLE_FILEWATCHER: Config.boolean("IMPACTR_EXPERIMENTAL_DISABLE_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),
  IMPACTR_EXPERIMENTAL_DISABLE_COPY_ON_SELECT:
    copy === undefined ? process.platform === "win32" : truthy("IMPACTR_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"),
  IMPACTR_MODELS_URL: process.env["IMPACTR_MODELS_URL"],
  IMPACTR_MODELS_PATH: process.env["IMPACTR_MODELS_PATH"],
  IMPACTR_DB: process.env["IMPACTR_DB"],

  IMPACTR_WORKSPACE_ID: process.env["IMPACTR_WORKSPACE_ID"],
  IMPACTR_EXPERIMENTAL_WORKSPACES: enabledByExperimental("IMPACTR_EXPERIMENTAL_WORKSPACES"),

  // Evaluated at access time (not module load) because tests, the CLI, and
  // external tooling set these env vars at runtime.
  get IMPACTR_DISABLE_PROJECT_CONFIG() {
    return truthy("IMPACTR_DISABLE_PROJECT_CONFIG")
  },
  get IMPACTR_EXPERIMENTAL_REFERENCES() {
    return enabledByExperimental("IMPACTR_EXPERIMENTAL_REFERENCES")
  },
  get IMPACTR_TUI_CONFIG() {
    return process.env["IMPACTR_TUI_CONFIG"]
  },
  get IMPACTR_CONFIG_DIR() {
    return process.env["IMPACTR_CONFIG_DIR"]
  },
  get IMPACTR_PURE() {
    return truthy("IMPACTR_PURE")
  },
  get IMPACTR_PERMISSION() {
    return process.env["IMPACTR_PERMISSION"]
  },
  get IMPACTR_PLUGIN_META_FILE() {
    return process.env["IMPACTR_PLUGIN_META_FILE"]
  },
  get IMPACTR_CLIENT() {
    return process.env["IMPACTR_CLIENT"] ?? "cli"
  },
}
