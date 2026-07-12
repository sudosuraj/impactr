import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import * as BrowserManager from "@/browser"

export const Parameters = Schema.Struct({
  action: Schema.Literals(["goto", "click", "type", "evaluate", "extract_html", "close"]).annotate({ description: "The browser action to perform." }),
  url: Schema.optional(Schema.String).annotate({ description: "URL to navigate to (required for 'goto')." }),
  selector: Schema.optional(Schema.String).annotate({ description: "CSS selector for the element (required for 'click' and 'type')." }),
  text: Schema.optional(Schema.String).annotate({ description: "Text to type into an input (required for 'type')." }),
  js: Schema.optional(Schema.String).annotate({ description: "JavaScript code to evaluate in the browser context (required for 'evaluate')." }),
})

export const BrowserTool = Tool.define(
  "browser",
  Effect.succeed({
    description: "Headless browser interaction tool. Allows navigating pages, interacting with the DOM, executing JavaScript, and extracting HTML.",
    parameters: Parameters,
    execute: ({ action, url, selector, text, js }, ctx) => Effect.gen(function* () {
      const browser = yield* BrowserManager.Service

      if (action === "goto") {
        if (!url) return { output: "Error: url is required for goto." }
        yield* browser.goto(url)
        return { output: `Navigated to ${url}.` }
      }

      if (action === "click") {
        if (!selector) return { output: "Error: selector is required for click." }
        yield* browser.click(selector)
        return { output: `Clicked element matching selector: ${selector}` }
      }

      if (action === "type") {
        if (!selector || text === undefined) return { output: "Error: selector and text are required for type." }
        yield* browser.type(selector, text)
        return { output: `Typed '${text}' into element matching selector: ${selector}` }
      }

      if (action === "evaluate") {
        if (!js) return { output: "Error: js is required for evaluate." }
        const result = yield* browser.evaluate(js)
        return { output: `Evaluated JS. Result:\n${JSON.stringify(result, null, 2)}` }
      }

      if (action === "extract_html") {
        const html = yield* browser.extractHtml()
        return { output: `Extracted HTML (first 5000 chars):\n${html.substring(0, 5000)}...` }
      }

      if (action === "close") {
        yield* browser.close()
        return { output: "Browser session closed." }
      }

      return { output: "Unknown action." }
    }).pipe(Effect.catchAll(e => Effect.succeed({ output: `Browser error: ${e instanceof Error ? e.message : String(e)}` })))
  })
)
