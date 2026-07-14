import { defineConfig, PluginOption } from "vite"
import tailwindcss from "@tailwindcss/vite"
import { solidStart } from "@solidjs/start/config"
import { nitro } from "nitro/vite"

export default defineConfig({
  plugins: [
    tailwindcss(),
    solidStart() as PluginOption,
    nitro({
      compatibilityDate: "2024-09-19",
      preset: "node-server",
    }),
  ],
  server: {
    port: 3002,
  },
})
