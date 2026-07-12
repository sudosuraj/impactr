import { AgentV2 } from "@impactr-ai/core/agent"
import { AISDK } from "@impactr-ai/core/aisdk"
import { Catalog } from "@impactr-ai/core/catalog"
import { CommandV2 } from "@impactr-ai/core/command"
import { Credential } from "@impactr-ai/core/credential"
import { AppNodeBuilder } from "@impactr-ai/core/effect/app-node-builder"
import { LayerNodePlatform } from "@impactr-ai/core/effect/app-node-platform"
import { LayerNode } from "@impactr-ai/core/effect/layer-node"
import { EventV2 } from "@impactr-ai/core/event"
import { FileSystem } from "@impactr-ai/core/filesystem"
import { FSUtil } from "@impactr-ai/core/fs-util"
import { Integration } from "@impactr-ai/core/integration"
import { Location } from "@impactr-ai/core/location"
import { Npm } from "@impactr-ai/core/npm"
import { PluginV2 } from "@impactr-ai/core/plugin"
import { Reference } from "@impactr-ai/core/reference"
import { SkillV2 } from "@impactr-ai/core/skill"
import { Effect, Layer } from "effect"
import { tempLocationLayer } from "../fixture/location"

const npmLayer = Layer.succeed(
  Npm.Service,
  Npm.Service.of({
    add: () => Effect.succeed({ directory: "", entrypoint: undefined }),
    install: () => Effect.void,
    which: () => Effect.succeed(undefined),
  }),
)

export const PluginTestLayer = AppNodeBuilder.build(
  LayerNode.group([
    FileSystem.node,
    FSUtil.node,
    Location.node,
    Npm.node,
    Credential.node,
    EventV2.node,
    LayerNodePlatform.httpClient,
    PluginV2.node,
    AgentV2.node,
    AISDK.node,
    Catalog.node,
    CommandV2.node,
    Integration.node,
    Reference.node,
    SkillV2.node,
  ]),
  [
    [Location.node, tempLocationLayer],
    [Npm.node, npmLayer],
  ],
)
