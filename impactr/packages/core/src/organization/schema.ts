export * as OrganizationSchema from "./schema"

import { Organization } from "@impactr-ai/schema/organization"
import { User } from "@impactr-ai/schema/user"

export const ID = Organization.ID
export type ID = typeof ID.Type

export const Info = Organization.Info
export type Info = Organization.Info

export const Role = Organization.Role
export type Role = Organization.Role

export const Membership = Organization.Membership
export type Membership = Organization.Membership

export const UserID = User.ID
export type UserID = typeof UserID.Type

export const UserInfo = User.Info
export type UserInfo = User.Info
