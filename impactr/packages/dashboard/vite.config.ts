import { defineConfig, PluginOption, UserConfig } from "vite"
import tailwindcss from "@tailwindcss/vite"
import { solidStart } from "@solidjs/start/config"
import { nitro } from "nitro/vite"

// SolidStart injects `import.meta.env.START_APP_ENTRY` as a define whose value is the
// absolute app-entry path wrapped in quotes. On Windows that path uses backslashes, so
// esbuild's `define` plugin sees invalid escape sequences (`\U`, `\S`, ...) and rejects
// the value. Normalize any backslashes in string defines to forward slashes. This runs
// after solidStart() so it sees and corrects the already-injected value.
function normalizeWindowsDefines(): PluginOption {
  return {
    name: "impactr:normalize-windows-defines",
    config(config): UserConfig | undefined {
      const define = config.define
      if (!define) return
      const fixed: Record<string, string> = {}
      for (const [key, value] of Object.entries(define)) {
        if (typeof value === "string" && value.includes("\\")) {
          fixed[key] = value.replace(/\\/g, "/")
        }
      }
      return Object.keys(fixed).length ? { define: fixed } : undefined
    },
  }
}

export default defineConfig({
  plugins: [
    tailwindcss(),
    solidStart() as PluginOption,
    normalizeWindowsDefines(),
    nitro({
      compatibilityDate: "2024-09-19",
      preset: "node-server",
    }),
  ],
  server: {
    port: 3002,
  },
})
