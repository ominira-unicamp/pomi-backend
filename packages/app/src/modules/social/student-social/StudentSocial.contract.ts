import { policies, StudentCapabilities } from "#/Authorization.js";
import { OutputBuilder, type IO } from "#/Contract.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
    createPaginationQuerySchema,
    filterDefinition,
    getPaginatedSchema,
    pathParam,
    pathSeg,
    resourceFilterSchema,
    ResourceNotFoundProblemSchema,
    UniqueConstraintConflictProblemSchema,
    unpaginatedByDefault,
    type Filter,
    type PaginationPolicy
} from "@pomi/api-core";
import z from "zod";

extendZodWithOpenApi(z);

const sidPath = z.object({
    sid: pathParam.integer()
});
const publicIdPath = sidPath.extend({ publicId: z.string().uuid() });
const friendshipPath = sidPath.extend({
    id: pathParam.integer()
});
const academicReference = z
    .object({ code: z.union([z.string(), z.number()]), name: z.string() })
    .strict();
const currentCourse = z
    .object({
        courseCode: z.string(),
        courseName: z.string(),
        classCode: z.string().nullable(),
        schedules: z
            .array(
                z
                    .object({
                        id: z.number().int().positive(),
                        dayOfWeek: z.enum([
                            "MONDAY",
                            "TUESDAY",
                            "WEDNESDAY",
                            "THURSDAY",
                            "FRIDAY",
                            "SATURDAY",
                            "SUNDAY"
                        ]),
                        start: z.string(),
                        end: z.string(),
                        roomCode: z.string()
                    })
                    .strict()
            )
            .readonly()
    })
    .strict()
    .openapi("StudentCurrentCourse");
const person = z
    .object({
        publicId: z.string().uuid(),
        displayName: z.string(),
        bio: z.string().nullable(),
        interests: z
            .array(
                z
                    .object({
                        id: z.number().int().positive(),
                        name: z.string()
                    })
                    .strict()
            )
            .readonly(),
        currentCourses: z.array(currentCourse).readonly(),
        program: academicReference.nullable(),
        specialization: academicReference.nullable(),
        entryYear: z.number().int().nullable(),
        _paths: z.object({ self: z.string() }).strict()
    })
    .strict()
    .openapi("StudentPublicPerson");
const ownProfile = person
    .extend({
        enabled: z.boolean(),
        currentCoursesVisibility: z.enum(["PRIVATE", "FRIENDS", "PUBLIC"])
    })
    .strict()
    .openapi("StudentPublicProfile");
const friendship = z
    .object({
        id: z.number().int(),
        status: z.enum(["PENDING", "ACCEPTED"]),
        direction: z.enum(["INCOMING", "OUTGOING", "NONE"]),
        friend: person,
        createdAt: z.string().datetime(),
        acceptedAt: z.string().datetime().nullable(),
        _paths: z.object({ self: z.string(), friend: z.string() }).strict()
    })
    .strict()
    .openapi("StudentFriendship");
const profileBody = z
    .object({
        enabled: z.boolean().optional(),
        displayName: z.string().trim().min(1).max(80).nullable().optional(),
        bio: z.string().trim().max(280).nullable().optional(),
        currentCoursesVisibility: z
            .enum(["PRIVATE", "FRIENDS", "PUBLIC"])
            .optional()
    })
    .strict();
const profilePath = [
    pathSeg.literal("student"),
    pathSeg.param("sid"),
    pathSeg.literal("public-profile")
];
const peoplePath = [
    pathSeg.literal("student"),
    pathSeg.param("sid"),
    pathSeg.literal("people")
];
const friendshipsPath = [
    pathSeg.literal("student"),
    pathSeg.param("sid"),
    pathSeg.literal("friendships")
];
const read = policies.studentAccess("sid", StudentCapabilities.SOCIAL_READ);
const write = policies.studentAccess("sid", StudentCapabilities.SOCIAL_WRITE);

const friendshipFilter = resourceFilterSchema(
    {
        status: filterDefinition.enum(["PENDING", "ACCEPTED"]),
        direction: filterDefinition.enum(["INCOMING", "OUTGOING"], ["eq"])
    },
    "student friendships",
    "Structured friendship filters. Use filter[status]=PENDING or filter[direction]=INCOMING.",
    { status: "PENDING" }
);
export type StudentFriendshipFilter = Filter;

export const studentPeoplePagination = {
    defaultMode: "page",
    defaultPageSize: 20,
    maxPageSize: 50,
    allowAll: false
} satisfies PaginationPolicy;

const getProfile = {
    meta: {
        method: "get" as const,
        path: profilePath,
        tags: ["student-social"],
        authorization: read
    },
    request: z.object({ path: sidPath }),
    response: new OutputBuilder()
        .ok(ownProfile, "Perfil público recuperado")
        .problem(404, ResourceNotFoundProblemSchema, "Aluno não encontrado")
        .build()
} satisfies IO;
const updateProfile = {
    meta: {
        method: "patch" as const,
        path: profilePath,
        tags: ["student-social"],
        authorization: write
    },
    request: z.object({ path: sidPath, body: profileBody }),
    response: new OutputBuilder()
        .ok(ownProfile, "Perfil público atualizado")
        .problem(404, ResourceNotFoundProblemSchema, "Aluno não encontrado")
        .build()
} satisfies IO;
const listPeople = {
    meta: {
        method: "get" as const,
        path: peoplePath,
        tags: ["student-social"],
        authorization: read,
        sdk: {
            resource: "studentPeople",
            action: "list" as const,
            pathParameters: { sid: "studentId" }
        },
        pagination: studentPeoplePagination
    },
    request: z.object({
        path: sidPath,
        query: createPaginationQuerySchema(studentPeoplePagination, {
            query: z.string().trim().min(1).optional()
        })
    }),
    response: new OutputBuilder()
        .ok(
            getPaginatedSchema(person).openapi("StudentPeoplePage"),
            "Pessoas recuperadas"
        )
        .build()
} satisfies IO;
const getPerson = {
    meta: {
        method: "get" as const,
        path: [...peoplePath, pathSeg.param("publicId")],
        tags: ["student-social"],
        authorization: read
    },
    request: z.object({ path: publicIdPath }),
    response: new OutputBuilder()
        .ok(person, "Pessoa recuperada")
        .problem(404, ResourceNotFoundProblemSchema, "Pessoa não encontrada")
        .build()
} satisfies IO;
const listFriendships = {
    meta: {
        method: "get" as const,
        path: friendshipsPath,
        tags: ["student-social"],
        authorization: read,
        queryFeatures: { filter: true },
        pagination: unpaginatedByDefault
    },
    request: z.object({
        path: sidPath,
        query: createPaginationQuerySchema(unpaginatedByDefault, {
            filter: friendshipFilter.optional()
        })
            .strict()
            .openapi("ListStudentFriendshipsQuery")
    }),
    response: new OutputBuilder()
        .ok(getPaginatedSchema(friendship), "Amizades recuperadas")
        .build()
} satisfies IO;
const createFriendship = {
    meta: {
        method: "post" as const,
        path: friendshipsPath,
        tags: ["student-social"],
        authorization: write
    },
    request: z.object({
        path: sidPath,
        body: z.object({ targetPublicId: z.string().uuid() }).strict()
    }),
    response: new OutputBuilder()
        .created(friendship, "Solicitação de amizade criada")
        .problem(404, ResourceNotFoundProblemSchema, "Pessoa não encontrada")
        .problem(
            409,
            UniqueConstraintConflictProblemSchema,
            "Solicitação conflitante"
        )
        .build()
} satisfies IO;
const acceptFriendship = {
    meta: {
        method: "post" as const,
        path: [
            ...friendshipsPath,
            pathSeg.param("id"),
            pathSeg.literal("accept")
        ],
        tags: ["student-social"],
        authorization: write
    },
    request: z.object({ path: friendshipPath }),
    response: new OutputBuilder()
        .ok(friendship, "Amizade aceita")
        .problem(
            404,
            ResourceNotFoundProblemSchema,
            "Solicitação não encontrada"
        )
        .problem(
            409,
            UniqueConstraintConflictProblemSchema,
            "Solicitação não pode ser aceita"
        )
        .build()
} satisfies IO;
const removeFriendship = {
    meta: {
        method: "delete" as const,
        path: [...friendshipsPath, pathSeg.param("id")],
        tags: ["student-social"],
        authorization: write
    },
    request: z.object({ path: friendshipPath }),
    response: new OutputBuilder()
        .noContent()
        .problem(404, ResourceNotFoundProblemSchema, "Amizade não encontrada")
        .build()
} satisfies IO;

export default {
    schemas: { person, ownProfile, friendship },
    getProfile,
    updateProfile,
    listPeople,
    getPerson,
    listFriendships,
    createFriendship,
    acceptFriendship,
    removeFriendship
};
