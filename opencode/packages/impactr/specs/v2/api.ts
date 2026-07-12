// @ts-nocheck

import { Impactr } from "@impactr-ai/core"
import { ReadTool } from "@impactr-ai/core/tools"

const impactr = Impactr.make({})

impactr.tool.add(ReadTool)

impactr.tool.add({
  name: "bash",
  schema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The command to run.",
      },
    },
    required: ["command"],
  },
  execute(input, ctx) {},
})

impactr.auth.add({
  provider: "openai",
  type: "api",
  value: process.env.OPENAI_API_KEY,
})

impactr.agent.add({
  name: "build",
  permissions: [],
  model: {
    id: "gpt-5-5",
    provider: "openai",
    variant: "xhigh",
  },
})

const sessionID = await impactr.session.create({
  agent: "build",
})

impactr.subscribe((event) => {
  console.log(event)
})

await impactr.session.prompt({
  sessionID,
  text: "hey what is up",
})

await impactr.session.prompt({
  sessionID,
  text: "what is up with this",
  files: [
    {
      mime: "image/png",
      uri: "data:image/png;base64,xxxx",
    },
  ],
})

await impactr.session.wait()

console.log(await impactr.session.messages(sessionID))
