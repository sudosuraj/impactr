interface ImportMetaEnv {
  readonly IMPACTR_CHANNEL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module "virtual:impactr-server" {
  export namespace Server {
    export const listen: typeof import("../../../impactr/dist/types/src/node").Server.listen
    export type Listener = import("../../../impactr/dist/types/src/node").Server.Listener
  }
  export namespace Config {
    export const get: typeof import("../../../impactr/dist/types/src/node").Config.get
    export type Info = import("../../../impactr/dist/types/src/node").Config.Info
  }
  export const bootstrap: typeof import("../../../impactr/dist/types/src/node").bootstrap
}
