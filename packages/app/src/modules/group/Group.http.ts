export { groupPermission, id, operations, publicTag } from "./Group.schemas.js";
import { policies } from "#/Authorization.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
    ApiResponse,
    buildArrayPaginationResponse,
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
export const base = (name: string) => [pathSeg.literal(name)];
export const studentBase = (name: string) => [
    ...student,
    pathSeg.literal(name)
];
type GroupMetadata = {
    operationId: string;
    method: "get" | "post" | "patch" | "delete";
    path: ReturnType<typeof base>;
    sdkAction: "list" | "create" | "update" | "delete" | "get";
    queryFeatures: { filter: boolean };
};

function groupMeta(definition: GroupMetadata) {
    return {
        operationId: definition.operationId,
        sdk: {
            resource: "groupCommunity",
            method: definition.operationId,
            action: definition.sdkAction,
            pathParameters: Object.fromEntries(
                definition.path
                    .filter((segment) => segment.type === "param")
                    .map((segment) => [
                        segment.name,
                        segment.name === "sid" ? "studentId" : segment.name
                    ])
            )
        },
        method: definition.method,
        path: definition.path,
        tags: ["groups"],
        queryFeatures: definition.queryFeatures
    };
}

export function publicMeta(definition: GroupMetadata & { method: "get" }) {
    return { ...groupMeta(definition), authorization: policies.public };
}

export function studentMeta(
    definition: GroupMetadata & {
        capability: "STUDENT_PROFILE_READ" | "STUDENT_PROFILE_WRITE";
    }
) {
    return {
        ...groupMeta(definition),
        authorization: policies.studentAccess("sid", definition.capability)
    };
}
export const sid = z.object({ sid: pathId });
export const sidId = sid.extend({ id: pathId });
export const publicId = z.object({ id: pathId });
export const groupQuery = z.object({ groupId: pathId }).strict();

export const page = <T>(
    items: T[],
    query: Parameters<typeof buildArrayPaginationResponse<T>>[1],
    path: string
) =>
    ApiResponse.ok(
        buildArrayPaginationResponse(items, query, unpaginatedByDefault, path)
    );
export const groupId = (query: {
    filter?: { path: string[]; values: (string | number)[] }[];
}) =>
    query.filter?.find((entry) => entry.path.join(".") === "groupId")
        ?.values[0] as number | undefined;
export const profilePublicId = (query: {
    filter?: { path: string[]; values: (string | number)[] }[];
}) =>
    query.filter?.find((entry) => entry.path.join(".") === "publicId")
        ?.values[0] as string | undefined;
