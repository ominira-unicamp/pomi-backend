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
    groupQuery,
    id,
    listQuery,
    sid,
    sidId,
    studentBase,
    studentMeta
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
            path: studentBase("group-roles"),
            sdkAction: "list",
            queryFeatures: { filter: true },
            capability: "STUDENT_PROFILE_READ"
        }),
        pagination: unpaginatedByDefault
    },
    request: z.object({ path: sid, query: listQuery }),
    response: new OutputBuilder()
        .ok(getPaginatedSchema(role), "Roles do grupo")
        .build()
} satisfies IO;
export const createRole = {
    meta: studentMeta({
        operationId: "createGroupRole",
        method: "post",
        path: studentBase("group-roles"),
        sdkAction: "create",
        queryFeatures: { filter: false },
        capability: "STUDENT_PROFILE_WRITE"
    }),
    request: z.object({
        path: sid,
        query: groupQuery,
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
        path: [...studentBase("group-roles"), pathSeg.param("id")],
        sdkAction: "update",
        queryFeatures: { filter: false },
        capability: "STUDENT_PROFILE_WRITE"
    }),
    request: z.object({ path: sidId, body: rolePatch }),
    response: new OutputBuilder().ok(role, "Role atualizada").notFound().build()
} satisfies IO;
export const deleteRole = {
    meta: studentMeta({
        operationId: "deleteGroupRole",
        method: "delete",
        path: [...studentBase("group-roles"), pathSeg.param("id")],
        sdkAction: "delete",
        queryFeatures: { filter: false },
        capability: "STUDENT_PROFILE_WRITE"
    }),
    request: z.object({ path: sidId }),
    response: new OutputBuilder().noContent("Role removida").notFound().build()
} satisfies IO;
export default { listRoles, createRole, patchRole, deleteRole };
