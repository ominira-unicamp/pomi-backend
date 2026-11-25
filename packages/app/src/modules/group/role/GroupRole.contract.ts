import { type IO, OutputBuilder } from "#/Contract.js";
import {
    getPaginatedSchema,
    pathSeg,
    unpaginatedByDefault
} from "@pomi/api-core";
import z from "zod";
import {
    entityMeta,
    groupPermission,
    groupResourceQuery,
    id,
    studentMeta,
    userGroupBase,
    userGroupPath,
    userGroupRolePath
} from "../Group.http.js";
import { rolePatch } from "./GroupRole.schemas.js";
export { rolePatch } from "./GroupRole.schemas.js";

export const role = z
    .object({
        id,
        groupId: id,
        name: z.string(),
        permissions: z.array(z.string())
    })
    .strict()
    .openapi("GroupRole", entityMeta("GroupRole"));
export const listRoles = {
    meta: {
        ...studentMeta({
            operationId: "listGroupRoles",
            method: "get",
            path: userGroupBase("roles"),
            sdkAction: "list",
            queryFeatures: { filter: false },
            capability: "USER_PROFILE_READ"
        }),
        pagination: unpaginatedByDefault
    },
    request: z.object({ path: userGroupPath, query: groupResourceQuery }),
    response: new OutputBuilder()
        .ok(getPaginatedSchema(role), "Roles do grupo")
        .build()
} satisfies IO;
export const createRole = {
    meta: studentMeta({
        operationId: "createGroupRole",
        method: "post",
        path: userGroupBase("roles"),
        sdkAction: "create",
        queryFeatures: { filter: false },
        capability: "USER_PROFILE_WRITE"
    }),
    request: z.object({
        path: userGroupPath,
        body: z
            .object({
                name: z.string().trim().min(1).max(80),
                permissions: z.array(groupPermission).optional()
            })
            .strict()
    }),
    response: new OutputBuilder().created(role, "Role criada").build()
} satisfies IO;
export const patchRole = {
    meta: studentMeta({
        operationId: "updateGroupRole",
        method: "patch",
        path: [...userGroupBase("roles"), pathSeg.param("roleId")],
        sdkAction: "update",
        queryFeatures: { filter: false },
        capability: "USER_PROFILE_WRITE"
    }),
    request: z.object({ path: userGroupRolePath, body: rolePatch }),
    response: new OutputBuilder().ok(role, "Role atualizada").notFound().build()
} satisfies IO;
export const deleteRole = {
    meta: studentMeta({
        operationId: "deleteGroupRole",
        method: "delete",
        path: [...userGroupBase("roles"), pathSeg.param("roleId")],
        sdkAction: "delete",
        queryFeatures: { filter: false },
        capability: "USER_PROFILE_WRITE"
    }),
    request: z.object({ path: userGroupRolePath }),
    response: new OutputBuilder().noContent("Role removida").notFound().build()
} satisfies IO;
export default { listRoles, createRole, patchRole, deleteRole };
