import { policies, UserCapabilities } from "#/Authorization.js";
import { type IO, OutputBuilder } from "#/Contract.js";
import { InvalidStudentProfileProblem } from "#/modules/student/Student.problems.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
    createPaginationQuerySchema,
    defineSort,
    getPaginatedSchema,
    pathParam,
    pathSeg,
    ReferenceNotFoundProblemSchema,
    ResourceNotFoundProblemSchema,
    resourceSortSchema,
    SpecBuilder,
    UniqueConstraintConflictProblemSchema,
    unpaginatedByDefault
} from "@pomi/api-core";
import z from "zod";

extendZodWithOpenApi(z);

const basePath = [
    pathSeg.literal("users"),
    pathSeg.param("userId"),
    pathSeg.literal("student")
];
const tags = ["students"];
const specsBuilder = new SpecBuilder(basePath, tags, "id", {
    resource: "students",
    operationName: "Students",
    pathParameters: { id: "studentId" }
});

const studentEntity = z
    .object({
        id: z.number().int(),
        userId: z.number().int(),
        ra: z.string().regex(/^\d{6}$/),
        name: z.string(),
        programId: z.number().int().nullable(),
        specializationId: z.number().int().nullable(),
        catalogId: z.number().int().nullable(),
        entryYear: z.number().int().min(1900).max(9999).nullable(),
        languageId: z.number().int().nullable()
    })
    .strict()
    .openapi("StudentEntity", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "Student",
            identityFields: ["id"]
        }
    });

const studentBase = z
    .object({
        id: z.number().int(),
        ra: z.string().regex(/^\d{6}$/),
        name: z.string(),
        programId: z.number().int().nullable().optional(),
        specializationId: z.number().int().nullable().optional(),
        catalogId: z.number().int().nullable().optional(),
        entryYear: z.number().int().min(1900).max(9999).nullable().optional(),
        languageId: z.number().int().nullable().optional()
    })
    .strict();
export const studentSort = defineSort({
    resourceName: "students",
    sortableFields: ["id", "ra", "name", "entryYear"] as const,
    defaultSort: [{ field: "id", direction: "asc" }] as const,
    tieBreakers: [{ field: "id", direction: "asc" }] as const
});

const createStudentBody = studentBase
    .omit({ id: true })
    .openapi("CreateStudentBody", {
        "x-pomi-schema": { kind: "input", publicName: "CreateStudentBody" }
    });

const patchStudentBody = studentBase
    .omit({ id: true })
    .partial()
    .strict()
    .openapi("PatchStudentBody", {
        "x-pomi-schema": { kind: "input", publicName: "PatchStudentBody" }
    });

const get = {
    meta: {
        ...specsBuilder.get(),
        path: basePath,
        sdk: {
            ...specsBuilder.get().sdk,
            pathParameters: { userId: "userId" }
        },
        authorization: policies.userAccess(
            "userId",
            UserCapabilities.PROFILE_READ
        )
    },
    request: z.object({
        path: z.object({
            userId: pathParam.positiveInteger()
        })
    }),
    response: new OutputBuilder()
        .ok(studentEntity, "Student retrieved successfully")
        .problem(404, ResourceNotFoundProblemSchema, "Aluno não encontrado")
        .build()
} satisfies IO;

const list = {
    meta: {
        ...specsBuilder.list(),
        path: [pathSeg.literal("admin"), pathSeg.literal("students")],
        authorization: policies.admin,
        queryFeatures: { sort: true },
        pagination: unpaginatedByDefault
    },
    request: z.object({
        query: createPaginationQuerySchema(unpaginatedByDefault, {
            sort: resourceSortSchema(studentSort).optional()
        })
    }),
    response: new OutputBuilder()
        .ok(
            getPaginatedSchema(studentEntity),
            "List of students retrieved successfully"
        )
        .build()
} satisfies IO;

const create = {
    meta: {
        ...specsBuilder.create(),
        sdk: {
            ...specsBuilder.create().sdk,
            pathParameters: { userId: "userId" }
        },
        authorization: policies.academicRegistration
    },
    request: z.object({
        path: z.object({ userId: pathParam.positiveInteger() }),
        body: createStudentBody
    }),
    response: new OutputBuilder()
        .ok(studentEntity, "Existing student linked successfully")
        .created(studentEntity, "Student created successfully")
        .problem(
            409,
            UniqueConstraintConflictProblemSchema,
            "Conflito de identidade do aluno"
        )
        .problem(
            422,
            z.discriminatedUnion("type", [
                ReferenceNotFoundProblemSchema,
                InvalidStudentProfileProblem.schema
            ]),
            "Perfil de aluno inválido"
        )
        .build()
} satisfies IO;

const patch = {
    meta: {
        ...specsBuilder.patch(),
        path: basePath,
        sdk: {
            ...specsBuilder.patch().sdk,
            pathParameters: { userId: "userId" }
        },
        authorization: policies.userAccess(
            "userId",
            UserCapabilities.PROFILE_WRITE
        )
    },
    request: z.object({
        path: z.object({
            userId: pathParam.positiveInteger()
        }),
        body: patchStudentBody
    }),
    response: new OutputBuilder()
        .ok(studentEntity, "Student updated successfully")
        .problem(404, ResourceNotFoundProblemSchema, "Aluno não encontrado")
        .problem(
            422,
            z.discriminatedUnion("type", [
                ReferenceNotFoundProblemSchema,
                InvalidStudentProfileProblem.schema
            ]),
            "Perfil de aluno inválido"
        )
        .build()
} satisfies IO;

const remove = {
    meta: {
        ...specsBuilder.remove(),
        path: basePath,
        sdk: {
            ...specsBuilder.remove().sdk,
            pathParameters: { userId: "userId" }
        },
        authorization: policies.userAccess(
            "userId",
            UserCapabilities.PROFILE_WRITE
        )
    },
    request: z.object({
        path: z.object({
            userId: pathParam.positiveInteger()
        }),
        body: z
            .object({
                confirmationRa: z.string().regex(/^\d{6}$/)
            })
            .strict()
    }),
    response: new OutputBuilder()
        .noContent("Student deleted successfully")
        .problem(404, ResourceNotFoundProblemSchema, "Aluno não encontrado")
        .problem(
            422,
            InvalidStudentProfileProblem.schema,
            "Confirmação inválida"
        )
        .build()
} satisfies IO;

export default {
    schema: studentEntity,
    get,
    list,
    create,
    patch,
    remove
};
