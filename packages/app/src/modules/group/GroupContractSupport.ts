import { policies, StudentCapabilities } from "#/Authorization.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
    createPaginationQuerySchema,
    filterDefinition,
    pathParam,
    pathSeg,
    resourceFilterSchema,
    unpaginatedByDefault
} from "@pomi/api-core";
import z from "zod";
extendZodWithOpenApi(z);
export const entityMeta = (publicName: string) => ({
    "x-pomi-schema": {
        kind: "entity",
        publicName,
        identityFields: ["id"]
    } as const
});
export const id = z.number().int().positive();
export const pathId = pathParam.positiveInteger();
export const student = [pathSeg.literal("student"), pathSeg.param("sid")];
export const listQuery = createPaginationQuerySchema(unpaginatedByDefault, {
    filter: resourceFilterSchema(
        { groupId: filterDefinition.id({ positive: true }) },
        "grupos",
        "Filtre por filter[groupId]=42.",
        { groupId: 42 }
    ).optional()
});
export const publicTag = z
    .object({ id, name: z.string(), categoryId: id })
    .strict();
export const groupPermission = z.enum([
    "GROUP_EDIT",
    "GROUP_TAG_MANAGE",
    "MEMBER_MANAGE",
    "ROLE_MANAGE",
    "EVENT_CREATE",
    "EVENT_EDIT",
    "EVENT_PUBLISH"
]);
export const operations = <T extends z.ZodType>(value: T) =>
    z
        .object({
            add: z.array(value).optional(),
            remove: z.array(id).optional()
        })
        .strict();
export const base = (name: string) => [pathSeg.literal(name)];
export const studentBase = (name: string) => [
    ...student,
    pathSeg.literal(name)
];
export const sdk = (
    name: string,
    method: "get" | "post" | "patch" | "delete",
    path: ReturnType<typeof base>
) => ({
    resource: "groupCommunity",
    method: name,
    action: (name.startsWith("list")
        ? "list"
        : method === "post"
          ? "create"
          : method === "patch"
            ? "update"
            : method === "delete"
              ? "delete"
              : "get") as "list" | "create" | "update" | "delete" | "get",
    pathParameters: Object.fromEntries(
        path
            .filter((segment) => segment.type === "param")
            .map((segment) => [
                segment.name,
                segment.name === "sid" ? "studentId" : segment.name
            ])
    )
});
export const publicMeta = (
    name: string,
    method: "get",
    path: ReturnType<typeof base>
) => ({
    operationId: name,
    sdk: sdk(name, method, path),
    method,
    path,
    tags: ["groups"],
    authorization: policies.public,
    queryFeatures: { filter: name.startsWith("list") }
});
export const studentMeta = (
    name: string,
    method: "get" | "post" | "patch" | "delete",
    path: ReturnType<typeof studentBase>,
    write = false
) => ({
    operationId: name,
    sdk: sdk(name, method, path),
    method,
    path,
    tags: ["groups"],
    authorization: policies.studentAccess(
        "sid",
        write
            ? StudentCapabilities.PROFILE_WRITE
            : StudentCapabilities.PROFILE_READ
    ),
    queryFeatures: { filter: name.startsWith("list") }
});
export const sid = z.object({ sid: pathId });
export const sidId = sid.extend({ id: pathId });
export const publicId = z.object({ id: pathId });
export const groupQuery = z.object({ groupId: pathId }).strict();
