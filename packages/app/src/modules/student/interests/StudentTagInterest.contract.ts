import { policies, UserCapabilities } from "#/Authorization.js";
import { type IO, OutputBuilder } from "#/Contract.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
    createPaginationQuerySchema,
    defineSort,
    getPaginatedSchema,
    pathParam,
    pathSeg,
    ReferenceNotFoundProblemSchema,
    resourceSortSchema,
    unpaginatedByDefault
} from "@pomi/api-core";
import z from "zod";

extendZodWithOpenApi(z);

const studentPath = [
    pathSeg.literal("users"),
    pathSeg.param("userId"),
    pathSeg.literal("interests")
];

const studentTagPath = [...studentPath, pathSeg.param("tagId")];

const studentId = z.object({
    userId: pathParam.positiveInteger()
});

const studentTagId = studentId.extend({
    tagId: pathParam.positiveInteger()
});

const tag = z
    .object({
        id: z.number().int().positive(),
        name: z.string(),
        categoryId: z.number().int().positive(),
        parentTagId: z.number().int().positive().nullable()
    })
    .strict()
    .openapi("UserInterest", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "UserInterest",
            identityFields: ["id"]
        }
    });
export const studentTagInterestSort = defineSort({
    resourceName: "student tag interests",
    sortableFields: ["name"] as const,
    defaultSort: [{ field: "name", direction: "asc" }] as const,
    tieBreakers: [{ field: "id", direction: "asc" }] as const
});

const list = {
    meta: {
        operationId: "listUserInterests",
        sdk: {
            resource: "userInterests",
            method: "list",
            action: "list" as const,
            pathParameters: { userId: "userId" }
        },
        method: "get" as const,
        path: studentPath,
        tags: ["student-tag-interests"],
        authorization: policies.userAccess(
            "userId",
            UserCapabilities.PROFILE_READ
        ),
        queryFeatures: { sort: true },
        pagination: unpaginatedByDefault
    },
    request: z.object({
        path: studentId,
        query: createPaginationQuerySchema(unpaginatedByDefault, {
            sort: resourceSortSchema(studentTagInterestSort).optional()
        })
    }),
    response: new OutputBuilder()
        .ok(getPaginatedSchema(tag), "Interesses por tags recuperados")
        .build()
} satisfies IO;

const put = {
    meta: {
        operationId: "updateUserInterest",
        sdk: {
            resource: "userInterests",
            method: "update",
            action: "update" as const,
            pathParameters: { userId: "userId", tagId: "tagId" }
        },
        method: "put" as const,
        path: studentTagPath,
        tags: ["student-tag-interests"],
        authorization: policies.userAccess(
            "userId",
            UserCapabilities.PROFILE_WRITE
        )
    },
    request: z.object({ path: studentTagId }),
    response: new OutputBuilder()
        .noContent("Interesse por tag adicionado")
        .problem(422, ReferenceNotFoundProblemSchema, "Tag não encontrada")
        .build()
} satisfies IO;

const remove = {
    meta: {
        operationId: "deleteUserInterest",
        sdk: {
            resource: "userInterests",
            method: "delete",
            action: "delete" as const,
            pathParameters: { userId: "userId", tagId: "tagId" }
        },
        method: "delete" as const,
        path: studentTagPath,
        tags: ["student-tag-interests"],
        authorization: policies.userAccess(
            "userId",
            UserCapabilities.PROFILE_WRITE
        )
    },
    request: z.object({ path: studentTagId }),
    response: new OutputBuilder()
        .noContent("Interesse por tag removido")
        .build()
} satisfies IO;

export default { list, put, remove };
