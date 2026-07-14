export * as AsmAssetSchema from "./schema"

import { AsmAsset } from "@impactr-ai/schema/asm-asset"

export const ID = AsmAsset.ID
export type ID = typeof ID.Type

export const Info = AsmAsset.Info
export type Info = AsmAsset.Info

export const Type = AsmAsset.Type
export type Type = AsmAsset.Type
