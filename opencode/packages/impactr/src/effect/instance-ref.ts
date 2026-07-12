import { Context } from "effect"
import type { InstanceContext } from "@/project/instance-context"
import type { WorkspaceV2 } from "@impactr-ai/core/workspace"

export const InstanceRef = Context.Reference<InstanceContext | undefined>("~impactr/InstanceRef", {
  defaultValue: () => undefined,
})

export const WorkspaceRef = Context.Reference<WorkspaceV2.ID | undefined>("~impactr/WorkspaceRef", {
  defaultValue: () => undefined,
})
