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
export const student = [pathSeg.literal("users"), pathSeg.param("userId")];
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
export const userGroupBase = (name: string) => [
    ...student,
    pathSeg.literal("groups"),
    pathSeg.param("groupId"),
    pathSeg.literal(name)
];
export const groupResourceQuery =
    createPaginationQuerySchema(unpaginatedByDefault);
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
                        segment.name === "userId" ? "userId" : segment.name
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
        capability: "USER_PROFILE_READ" | "USER_PROFILE_WRITE";
    }
) {
    return {
        ...groupMeta(definition),
        authorization: policies.userAccess("userId", definition.capability)
    };
}
export const userId = z.object({ userId: pathId });
export const userGroupPath = userId.extend({ groupId: pathId });
export const userGroupMembershipPath = userGroupPath.extend({
    membershipId: pathId
});
export const userGroupRolePath = userGroupPath.extend({ roleId: pathId });
export const userGroupEventPath = userGroupPath.extend({ eventId: pathId });
export const sidId = userId.extend({ id: pathId });
export const publicId = z.object({ id: pathId });

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
