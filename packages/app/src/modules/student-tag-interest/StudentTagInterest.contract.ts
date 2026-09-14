import { policies, StudentCapabilities } from "#/Authorization.js";
import { type IO, OutputBuilder } from "#/Contract.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
    createPaginationQuerySchema,
    getPaginatedSchema,
    pathParam,
    pathSeg,
    ReferenceNotFoundProblemSchema,
    unpaginatedByDefault
} from "@pomi/api-core";
import z from "zod";

extendZodWithOpenApi(z);

const studentPath = [
    pathSeg.literal("student"),
    pathSeg.param("sid"),
    pathSeg.literal("tag-interests")
];

const studentTagPath = [...studentPath, pathSeg.param("tagId")];

const studentId = z.object({
    sid: pathParam.positiveInteger()
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
    .openapi("StudentTagInterest", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "StudentTagInterest",
            identityFields: ["id"]
        }
    });

const list = {
    meta: {
        operationId: "listStudentTagInterests",
        sdk: {
            resource: "studentTagInterests",
            method: "list",
            action: "list" as const,
            pathParameters: { sid: "studentId" }
        },
        method: "get" as const,
        path: studentPath,
        tags: ["student-tag-interests"],
        authorization: policies.studentAccess(
            "sid",
            StudentCapabilities.PROFILE_READ
        ),
        pagination: unpaginatedByDefault
    },
    request: z.object({
        path: studentId,
        query: createPaginationQuerySchema(unpaginatedByDefault)
    }),
    response: new OutputBuilder()
        .ok(getPaginatedSchema(tag), "Interesses por tags recuperados")
        .build()
} satisfies IO;

const put = {
    meta: {
        operationId: "updateStudentTagInterest",
        sdk: {
            resource: "studentTagInterests",
            method: "update",
            action: "update" as const,
            pathParameters: { sid: "studentId", tagId: "tagId" }
        },
        method: "put" as const,
        path: studentTagPath,
        tags: ["student-tag-interests"],
        authorization: policies.studentAccess(
            "sid",
            StudentCapabilities.PROFILE_WRITE
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
        operationId: "deleteStudentTagInterest",
        sdk: {
            resource: "studentTagInterests",
            method: "delete",
            action: "delete" as const,
            pathParameters: { sid: "studentId", tagId: "tagId" }
        },
        method: "delete" as const,
        path: studentTagPath,
        tags: ["student-tag-interests"],
        authorization: policies.studentAccess(
            "sid",
            StudentCapabilities.PROFILE_WRITE
        )
    },
    request: z.object({ path: studentTagId }),
    response: new OutputBuilder()
        .noContent("Interesse por tag removido")
        .build()
} satisfies IO;

export default { list, put, remove };
