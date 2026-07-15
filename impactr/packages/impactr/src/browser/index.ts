import { Context, Effect, Layer, Ref } from "effect"
import { chromium, type Browser as PlaywrightBrowser, type Page } from "playwright"

export interface Interface {
  readonly goto: (url: string) => Effect.Effect<void, Error>
  readonly click: (selector: string) => Effect.Effect<void, Error>
  readonly type: (selector: string, text: string) => Effect.Effect<void, Error>
  readonly evaluate: (js: string) => Effect.Effect<unknown, Error>
  readonly extractHtml: () => Effect.Effect<string, Error>
  readonly close: () => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@impactr/BrowserManager") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const browserRef = yield* Ref.make<PlaywrightBrowser | null>(null)
    const pageRef = yield* Ref.make<Page | null>(null)

    const getPage = Effect.gen(function* () {
      let page = yield* Ref.get(pageRef)
      if (page) return page

      const browser = yield* Effect.tryPromise({
        try: () => chromium.launch({ headless: true }),
        catch: (e) => new Error(`Failed to launch browser: ${e}`)
      })
      yield* Ref.set(browserRef, browser)

      const context = yield* Effect.tryPromise({
        try: () => browser.newContext(),
        catch: (e) => new Error(`Failed to create browser context: ${e}`)
      })
      
      page = yield* Effect.tryPromise({
        try: () => context.newPage(),
        catch: (e) => new Error(`Failed to create new page: ${e}`)
      })
      yield* Ref.set(pageRef, page)
      return page
    })

    const close = Effect.gen(function* () {
      const browser = yield* Ref.get(browserRef)
      if (browser) {
        yield* Effect.tryPromise(() => browser.close()).pipe(Effect.ignore)
        yield* Ref.set(browserRef, null)
        yield* Ref.set(pageRef, null)
      }
    })

    yield* Effect.addFinalizer(() => close)

    return Service.of({
      goto: (url) => Effect.gen(function* () {
        const page = yield* getPage
        yield* Effect.tryPromise({
          try: () => page.goto(url, { waitUntil: "networkidle" }),
          catch: (e) => new Error(`Failed to navigate to ${url}: ${e}`)
        })
      }),
      click: (selector) => Effect.gen(function* () {
        const page = yield* getPage
        yield* Effect.tryPromise({
          try: () => page.click(selector),
          catch: (e) => new Error(`Failed to click selector ${selector}: ${e}`)
        })
      }),
      type: (selector, text) => Effect.gen(function* () {
        const page = yield* getPage
        yield* Effect.tryPromise({
          try: () => page.fill(selector, text),
          catch: (e) => new Error(`Failed to fill selector ${selector}: ${e}`)
        })
      }),
      evaluate: (js) => Effect.gen(function* () {
        const page = yield* getPage
        return yield* Effect.tryPromise({
          try: () => page.evaluate(js),
          catch: (e) => new Error(`Failed to evaluate JS: ${e}`)
        })
      }),
      extractHtml: () => Effect.gen(function* () {
        const page = yield* getPage
        return yield* Effect.tryPromise({
          try: () => page.content(),
          catch: (e) => new Error(`Failed to extract HTML: ${e}`)
        })
      }),
      close: () => close,
    })
  })
)

import { LayerNode } from "@impactr-ai/core/effect/layer-node"
export const node = LayerNode.make({ service: Service, layer, deps: [] })
