import { afterEach, expect } from "bun:test"
import { LayerNode } from "@impactr-ai/core/effect/layer-node"
import { Cause, Effect, Exit, Layer } from "effect"
import path from "path"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { Agent } from "../../src/agent/agent"
import { Auth } from "../../src/auth"
import { Config } from "../../src/config/config"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { Global } from "@impactr-ai/core/global"
import { PentestAgent } from "@impactr-ai/core/agent/pentest"
import { Permission } from "../../src/permission"
import { PermissionV1 } from "@impactr-ai/core/v1/permission"
import { Plugin } from "../../src/plugin"
import { Provider } from "../../src/provider/provider"
import { Skill } from "../../src/skill"
import { Truncate } from "../../src/tool/truncate"

const agentLayer = (flags: Partial<RuntimeFlags.Info> = {}) =>
  LayerNode.compile(
    LayerNode.group([Agent.node, Plugin.node, Provider.node, Auth.node, Config.node, Skill.node, RuntimeFlags.node]),
    [[RuntimeFlags.node, RuntimeFlags.layer(flags)]],
  )

const it = testEffect(agentLayer())

/** An action name no agent's permission intent lists, to probe deny-by-default behavior. */
const UNLISTED_ACTION = "some_action_no_agent_lists"

// Helper to evaluate permission for a tool with wildcard pattern
function evalPerm(agent: Agent.Info | undefined, permission: string): PermissionV1.Action | undefined {
  if (!agent) return undefined
  return Permission.evaluate(permission, "*", agent.permission).action
}

function load<A>(fn: (svc: Agent.Interface) => Effect.Effect<A>) {
  return Agent.Service.use(fn)
}

const expectDefaultAgentError = Effect.fn("AgentTest.expectDefaultAgentError")(function* (message: string) {
  const exit = yield* load((svc) => svc.defaultAgent()).pipe(Effect.exit)
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isFailure(exit)) expect(Cause.pretty(exit.cause)).toContain(message)
})

afterEach(async () => {
  await disposeAllInstances()
})

it.instance("returns default native agents when no config", () =>
  Effect.gen(function* () {
    const agents = yield* load((svc) => svc.list())
    const names = agents.map((a) => a.name)
    expect(names).toContain("attack")
    expect(names).toContain("recon")
    expect(names).toContain("enumerate")
    expect(names).toContain("exploit")
    expect(names).toContain("report")
    expect(names).toContain("compaction")
    expect(names).toContain("title")
    expect(names).toContain("summary")
  }),
)

it.instance("attack agent has correct default properties", () =>
  Effect.gen(function* () {
    const attack = yield* load((svc) => svc.get("attack"))
    expect(attack).toBeDefined()
    expect(attack?.mode).toBe("primary")
    expect(attack?.native).toBe(true)
    expect(evalPerm(attack, "edit")).toBe("allow")
    expect(evalPerm(attack, "bash")).toBe("allow")
  }),
)

it.instance("recon agent denies edits but allows read and shell", () =>
  Effect.gen(function* () {
    const recon = yield* load((svc) => svc.get("recon"))
    expect(recon).toBeDefined()
    // Recon maps the attack surface but never modifies it.
    expect(evalPerm(recon, "edit")).toBe("deny")
    expect(evalPerm(recon, "read")).toBe("allow")
    expect(evalPerm(recon, "shell")).toBe("allow")
  }),
)

it.instance("explore agent denies edit and write", () =>
  Effect.gen(function* () {
    const explore = yield* load((svc) => svc.get("enumerate"))
    expect(explore).toBeDefined()
    expect(explore?.mode).toBe("subagent")
    expect(evalPerm(explore, "edit")).toBe("deny")
    expect(evalPerm(explore, "write")).toBe("deny")
    expect(evalPerm(explore, "todowrite")).toBe("deny")
  }),
)

it.instance("explore agent asks for external directories and allows whitelisted external paths", () =>
  Effect.gen(function* () {
    const explore = yield* load((svc) => svc.get("enumerate"))
    expect(explore).toBeDefined()
    expect(Permission.evaluate("external_directory", "/some/other/path", explore!.permission).action).toBe("ask")
    expect(Permission.evaluate("external_directory", Truncate.GLOB, explore!.permission).action).toBe("allow")
    expect(
      Permission.evaluate("external_directory", path.join(Global.Path.tmp, "agent-work"), explore!.permission).action,
    ).toBe("allow")
  }),
)

it.instance(
  "reference config does not create subagents",
  () =>
    Effect.gen(function* () {
      const agents = yield* load((svc) => svc.list())
      const names = agents.map((agent) => agent.name)
      expect(names).not.toContain("effect")
      expect(names).not.toContain("effectFull")
      expect(names).not.toContain("localdocs")
      expect(names).not.toContain("localdocsFull")
    }),
  {
    config: {
      references: {
        effect: "github.com/effect/effect-smol",
        effectFull: {
          repository: "Effect-TS/effect",
          branch: "main",
        },
        localdocs: "../docs",
        localdocsFull: {
          path: "../local-docs",
        },
      },
    },
  },
)

it.instance("enumerate subagent denies tools outside its allowlist", () =>
  Effect.gen(function* () {
    const enumerate = yield* load((svc) => svc.get("enumerate"))
    expect(enumerate).toBeDefined()
    expect(enumerate?.mode).toBe("subagent")
    // Enumerate is deny-by-default with a narrow allowlist, so todowrite is denied.
    expect(evalPerm(enumerate, "todowrite")).toBe("deny")
    expect(evalPerm(enumerate, "grep")).toBe("allow")
  }),
)

it.instance("compaction agent denies all permissions", () =>
  Effect.gen(function* () {
    const compaction = yield* load((svc) => svc.get("compaction"))
    expect(compaction).toBeDefined()
    expect(compaction?.hidden).toBe(true)
    expect(evalPerm(compaction, "bash")).toBe("deny")
    expect(evalPerm(compaction, "edit")).toBe("deny")
    expect(evalPerm(compaction, "read")).toBe("deny")
  }),
)

it.instance(
  "custom agent from config creates new agent",
  () =>
    Effect.gen(function* () {
      const custom = yield* load((svc) => svc.get("my_custom_agent"))
      expect(custom).toBeDefined()
      expect(String(custom?.model?.providerID)).toBe("openai")
      expect(String(custom?.model?.modelID)).toBe("gpt-4")
      expect(custom?.description).toBe("My custom agent")
      expect(custom?.temperature).toBe(0.5)
      expect(custom?.topP).toBe(0.9)
      expect(custom?.native).toBe(false)
      expect(custom?.mode).toBe("all")
    }),
  {
    config: {
      agent: {
        my_custom_agent: {
          model: "openai/gpt-4",
          description: "My custom agent",
          temperature: 0.5,
          top_p: 0.9,
        },
      },
    },
  },
)

it.instance(
  "custom agent config overrides native agent properties",
  () =>
    Effect.gen(function* () {
      const attack = yield* load((svc) => svc.get("attack"))
      expect(attack).toBeDefined()
      expect(String(attack?.model?.providerID)).toBe("anthropic")
      expect(String(attack?.model?.modelID)).toBe("claude-3")
      expect(attack?.description).toBe("Custom build agent")
      expect(attack?.temperature).toBe(0.7)
      expect(attack?.color).toBe("#FF0000")
      expect(attack?.native).toBe(true)
    }),
  {
    config: {
      agent: {
        attack: {
          model: "anthropic/claude-3",
          description: "Custom build agent",
          temperature: 0.7,
          color: "#FF0000",
        },
      },
    },
  },
)

it.instance(
  "agent disable removes agent from list",
  () =>
    Effect.gen(function* () {
      const explore = yield* load((svc) => svc.get("enumerate"))
      expect(explore).toBeUndefined()
      const agents = yield* load((svc) => svc.list())
      const names = agents.map((a) => a.name)
      expect(names).not.toContain("enumerate")
    }),
  {
    config: {
      agent: {
        enumerate: { disable: true },
      },
    },
  },
)

it.instance(
  "agent permission config merges with defaults",
  () =>
    Effect.gen(function* () {
      const attack = yield* load((svc) => svc.get("attack"))
      expect(attack).toBeDefined()
      // Specific pattern is denied
      expect(Permission.evaluate("bash", "rm -rf *", attack!.permission).action).toBe("deny")
      // Edit still allowed
      expect(evalPerm(attack, "edit")).toBe("allow")
    }),
  {
    config: {
      agent: {
        attack: {
          permission: {
            bash: {
              "rm -rf *": "deny",
            },
          },
        },
      },
    },
  },
)

it.instance(
  "global permission config applies to all agents",
  () =>
    Effect.gen(function* () {
      const attack = yield* load((svc) => svc.get("attack"))
      expect(attack).toBeDefined()
      expect(evalPerm(attack, "bash")).toBe("deny")
    }),
  {
    config: {
      permission: {
        bash: "deny",
      },
    },
  },
)

it.instance(
  "agent steps/maxSteps config sets steps property",
  () =>
    Effect.gen(function* () {
      const attack = yield* load((svc) => svc.get("attack"))
      const plan = yield* load((svc) => svc.get("recon"))
      expect(attack?.steps).toBe(50)
      expect(plan?.steps).toBe(100)
    }),
  {
    config: {
      agent: {
        attack: { steps: 50 },
        recon: { maxSteps: 100 },
      },
    },
  },
)

it.instance(
  "agent mode can be overridden",
  () =>
    Effect.gen(function* () {
      const explore = yield* load((svc) => svc.get("enumerate"))
      expect(explore?.mode).toBe("primary")
    }),
  {
    config: {
      agent: {
        enumerate: { mode: "primary" },
      },
    },
  },
)

it.instance(
  "agent name can be overridden",
  () =>
    Effect.gen(function* () {
      const attack = yield* load((svc) => svc.get("attack"))
      expect(attack?.name).toBe("Builder")
    }),
  {
    config: {
      agent: {
        attack: { name: "Builder" },
      },
    },
  },
)

it.instance(
  "agent prompt can be set from config",
  () =>
    Effect.gen(function* () {
      const attack = yield* load((svc) => svc.get("attack"))
      expect(attack?.prompt).toBe("Custom system prompt")
    }),
  {
    config: {
      agent: {
        attack: { prompt: "Custom system prompt" },
      },
    },
  },
)

it.instance(
  "unknown agent properties are placed into options",
  () =>
    Effect.gen(function* () {
      const attack = yield* load((svc) => svc.get("attack"))
      expect(attack?.options.random_property).toBe("hello")
      expect(attack?.options.another_random).toBe(123)
    }),
  {
    config: {
      agent: {
        attack: {
          random_property: "hello",
          another_random: 123,
        },
      },
    },
  },
)

it.instance(
  "agent options merge correctly",
  () =>
    Effect.gen(function* () {
      const attack = yield* load((svc) => svc.get("attack"))
      expect(attack?.options.custom_option).toBe(true)
      expect(attack?.options.another_option).toBe("value")
    }),
  {
    config: {
      agent: {
        attack: {
          options: {
            custom_option: true,
            another_option: "value",
          },
        },
      },
    },
  },
)

it.instance(
  "multiple custom agents can be defined",
  () =>
    Effect.gen(function* () {
      const agentA = yield* load((svc) => svc.get("agent_a"))
      const agentB = yield* load((svc) => svc.get("agent_b"))
      expect(agentA?.description).toBe("Agent A")
      expect(agentA?.mode).toBe("subagent")
      expect(agentB?.description).toBe("Agent B")
      expect(agentB?.mode).toBe("primary")
    }),
  {
    config: {
      agent: {
        agent_a: {
          description: "Agent A",
          mode: "subagent",
        },
        agent_b: {
          description: "Agent B",
          mode: "primary",
        },
      },
    },
  },
)

it.instance(
  "Agent.list keeps the default agent first and sorts the rest by name",
  () =>
    Effect.gen(function* () {
      const names = (yield* load((svc) => svc.list())).map((a) => a.name)
      expect(names[0]).toBe("recon")
      expect(names.slice(1)).toEqual(names.slice(1).toSorted((a, b) => a.localeCompare(b)))
    }),
  {
    config: {
      default_agent: "recon",
      agent: {
        zebra: {
          description: "Zebra",
          mode: "subagent",
        },
        alpha: {
          description: "Alpha",
          mode: "subagent",
        },
      },
    },
  },
)

it.instance("Agent.get returns undefined for non-existent agent", () =>
  Effect.gen(function* () {
    const nonExistent = yield* load((svc) => svc.get("does_not_exist"))
    expect(nonExistent).toBeUndefined()
  }),
)

it.instance("attack agent allows doom_loop and external_directory by default", () =>
  Effect.gen(function* () {
    const attack = yield* load((svc) => svc.get("attack"))
    // The full-engagement agent runs long autonomous loops across the authorized scope,
    // so these are permissive by default rather than prompting.
    expect(evalPerm(attack, "doom_loop")).toBe("allow")
    expect(evalPerm(attack, "external_directory")).toBe("allow")
  }),
)

it.instance("webfetch is allowed by default", () =>
  Effect.gen(function* () {
    const attack = yield* load((svc) => svc.get("attack"))
    expect(evalPerm(attack, "webfetch")).toBe("allow")
  }),
)

it.instance(
  "legacy tools config converts to permissions",
  () =>
    Effect.gen(function* () {
      const attack = yield* load((svc) => svc.get("attack"))
      expect(evalPerm(attack, "bash")).toBe("deny")
      expect(evalPerm(attack, "read")).toBe("deny")
    }),
  {
    config: {
      agent: {
        attack: {
          tools: {
            bash: false,
            read: false,
          },
        },
      },
    },
  },
)

it.instance(
  "legacy tools config maps write/edit/patch to edit permission",
  () =>
    Effect.gen(function* () {
      const attack = yield* load((svc) => svc.get("attack"))
      expect(evalPerm(attack, "edit")).toBe("deny")
    }),
  {
    config: {
      agent: {
        attack: {
          tools: {
            write: false,
          },
        },
      },
    },
  },
)

it.instance(
  "Truncate.GLOB is allowed even when user denies external_directory globally",
  () =>
    Effect.gen(function* () {
      const attack = yield* load((svc) => svc.get("attack"))
      expect(Permission.evaluate("external_directory", Truncate.GLOB, attack!.permission).action).toBe("allow")
      expect(Permission.evaluate("external_directory", Truncate.DIR, attack!.permission).action).toBe("deny")
      expect(Permission.evaluate("external_directory", "/some/other/path", attack!.permission).action).toBe("deny")
    }),
  {
    config: {
      permission: {
        external_directory: "deny",
      },
    },
  },
)

it.instance("attack agent allows external_directory paths including the global tmp directory", () =>
  Effect.gen(function* () {
    const attack = yield* load((svc) => svc.get("attack"))
    expect(
      Permission.evaluate("external_directory", path.join(Global.Path.tmp, "scratch"), attack!.permission).action,
    ).toBe("allow")
    expect(Permission.evaluate("external_directory", "/some/other/path", attack!.permission).action).toBe("allow")
  }),
)

it.instance(
  "Truncate.GLOB is allowed even when user denies external_directory per-agent",
  () =>
    Effect.gen(function* () {
      const attack = yield* load((svc) => svc.get("attack"))
      expect(Permission.evaluate("external_directory", Truncate.GLOB, attack!.permission).action).toBe("allow")
      expect(Permission.evaluate("external_directory", Truncate.DIR, attack!.permission).action).toBe("deny")
      expect(Permission.evaluate("external_directory", "/some/other/path", attack!.permission).action).toBe("deny")
    }),
  {
    config: {
      agent: {
        attack: {
          permission: {
            external_directory: "deny",
          },
        },
      },
    },
  },
)

it.instance(
  "explicit Truncate.GLOB deny is respected",
  () =>
    Effect.gen(function* () {
      const attack = yield* load((svc) => svc.get("attack"))
      expect(Permission.evaluate("external_directory", Truncate.GLOB, attack!.permission).action).toBe("deny")
      expect(Permission.evaluate("external_directory", Truncate.DIR, attack!.permission).action).toBe("deny")
    }),
  {
    config: {
      permission: {
        external_directory: {
          "*": "deny",
          [Truncate.GLOB]: "deny",
        },
      },
    },
  },
)

it.instance(
  "skill directories are allowed for external_directory",
  () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const skillDir = path.join(test.directory, ".impactr", "skill", "perm-skill")
      yield* Effect.promise(() =>
        Bun.write(
          path.join(skillDir, "SKILL.md"),
          `---
name: perm-skill
description: Permission skill.
---

# Permission Skill
`,
        ),
      )

      const home = process.env.IMPACTR_TEST_HOME
      process.env.IMPACTR_TEST_HOME = test.directory
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          process.env.IMPACTR_TEST_HOME = home
        }),
      )

      const attack = yield* load((svc) => svc.get("attack"))
      const target = path.join(skillDir, "reference", "notes.md")
      expect(Permission.evaluate("external_directory", target, attack!.permission).action).toBe("allow")
    }),
  { git: true },
)

it.instance(
  "project reference directories are allowed for external_directory",
  () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const attack = yield* load((svc) => svc.get("attack"))
      const target = path.resolve(test.directory, "../docs/reference/notes.md")
      expect(Permission.evaluate("external_directory", target, attack!.permission).action).toBe("allow")
    }),
  {
    git: true,
    config: {
      references: {
        docs: "../docs",
      },
    },
  },
)

it.instance("defaultAgent returns attack when no default_agent config", () =>
  Effect.gen(function* () {
    const agent = yield* load((svc) => svc.defaultAgent())
    expect(agent).toBe("attack")
  }),
)

it.instance("defaultInfo returns resolved attack agent when no default_agent config", () =>
  Effect.gen(function* () {
    const agent = yield* load((svc) => svc.defaultInfo())
    expect(agent.name).toBe("attack")
    expect(agent.mode).toBe("primary")
  }),
)

it.instance(
  "defaultAgent respects default_agent config set to recon",
  () =>
    Effect.gen(function* () {
      const agent = yield* load((svc) => svc.defaultAgent())
      expect(agent).toBe("recon")
    }),
  {
    config: {
      default_agent: "recon",
    },
  },
)

it.instance(
  "defaultAgent respects default_agent config set to custom agent with mode all",
  () =>
    Effect.gen(function* () {
      const agent = yield* load((svc) => svc.defaultAgent())
      expect(agent).toBe("my_custom")
    }),
  {
    config: {
      default_agent: "my_custom",
      agent: {
        my_custom: {
          description: "My custom agent",
        },
      },
    },
  },
)

it.instance(
  "defaultAgent throws when default_agent points to subagent",
  () => expectDefaultAgentError('default agent "enumerate" is a subagent'),
  {
    config: {
      default_agent: "enumerate",
    },
  },
)

it.instance(
  "defaultAgent throws when default_agent points to hidden agent",
  () => expectDefaultAgentError('default agent "compaction" is hidden'),
  {
    config: {
      default_agent: "compaction",
    },
  },
)

it.instance(
  "defaultAgent throws when default_agent points to non-existent agent",
  () => expectDefaultAgentError('default agent "does_not_exist" not found'),
  {
    config: {
      default_agent: "does_not_exist",
    },
  },
)

it.instance(
  "defaultAgent returns recon when attack is disabled and default_agent not set",
  () =>
    Effect.gen(function* () {
      const agent = yield* load((svc) => svc.defaultAgent())
      // attack is disabled, so it should return recon (next primary agent)
      expect(agent).toBe("recon")
    }),
  {
    config: {
      agent: {
        attack: { disable: true },
      },
    },
  },
)

it.instance(
  "defaultAgent throws when all primary agents are disabled",
  () => expectDefaultAgentError("no primary visible agent found"),
  {
    config: {
      agent: {
        attack: { disable: true },
        recon: { disable: true },
      },
    },
  },
)

// Guardrail against the CLI/hosted lineages drifting apart again: this asserts the CLI's
// *materialized* agent registry — not just its source code — actually matches the single source of
// truth in packages/core/src/agent/pentest.ts. packages/core/test/agent.test.ts runs the same check
// against the hosted materialized registry, so if either side ever stops consuming PentestAgent as-is,
// its own test fails here rather than silently drifting from the other.
it.instance("CLI pentest agents match the shared single source of truth", () =>
  Effect.gen(function* () {
    for (const definition of PentestAgent.all) {
      const info = yield* load((svc) => svc.get(definition.id))
      expect(info).toBeDefined()
      expect(info?.mode).toBe(definition.mode)

      for (const action of definition.permission.allow) expect(evalPerm(info, action)).toBe("allow")

      for (const action of definition.permission.deny ?? []) expect(evalPerm(info, action)).toBe("deny")

      expect(evalPerm(info, UNLISTED_ACTION)).toBe(definition.permission.denyByDefault ? "deny" : "allow")
    }
  }),
)
