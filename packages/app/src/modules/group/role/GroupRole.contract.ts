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
} from "../GroupContractSupport.js";

export const role = z
    .object({
        id,
        groupId: id,
        name: z.string(),
        permissions: z.array(z.string())
    })
    .strict()
    .openapi("GroupRole", entityMeta("GroupRole"));
export const rolePatch = z
    .object({
        name: z.string().trim().min(1).max(80).optional(),
        permissions: z
            .object({
                add: z.array(groupPermission).optional(),
                remove: z.array(groupPermission).optional()
            })
            .strict()
            .optional()
    })
    .strict();
export const listRoles = {
    meta: {
        ...studentMeta("listGroupRoles", "get", studentBase("group-roles")),
        pagination: unpaginatedByDefault
    },
    request: z.object({ path: sid, query: listQuery }),
    response: new OutputBuilder()
        .ok(getPaginatedSchema(role), "Roles do grupo")
        .build()
} satisfies IO;
export const createRole = {
    meta: studentMeta(
        "createGroupRole",
        "post",
        studentBase("group-roles"),
        true
    ),
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
    meta: studentMeta(
        "updateGroupRole",
        "patch",
        [...studentBase("group-roles"), pathSeg.param("id")],
        true
    ),
    request: z.object({ path: sidId, body: rolePatch }),
    response: new OutputBuilder().ok(role, "Role atualizada").notFound().build()
} satisfies IO;
export const deleteRole = {
    meta: studentMeta(
        "deleteGroupRole",
        "delete",
        [...studentBase("group-roles"), pathSeg.param("id")],
        true
    ),
    request: z.object({ path: sidId }),
    response: new OutputBuilder().noContent("Role removida").notFound().build()
} satisfies IO;
export default { listRoles, createRole, patchRole, deleteRole };
