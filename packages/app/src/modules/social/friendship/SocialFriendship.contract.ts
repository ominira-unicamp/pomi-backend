import { policies, StudentCapabilities } from "#/Authorization.js";
import { OutputBuilder, type IO } from "#/Contract.js";
import {
    createPaginationQuerySchema,
    defineSort,
    filterDefinition,
    getPaginatedSchema,
    pathSeg,
    resourceFilterSchema,
    ResourceNotFoundProblemSchema,
    resourceSortSchema,
    UniqueConstraintConflictProblemSchema,
    unpaginatedByDefault,
    type Filter
} from "@pomi/api-core";
import z from "zod";
import { friendship, friendshipPath, sidPath } from "../Social.schemas.js";

const friendshipFilter = resourceFilterSchema(
    {
        status: filterDefinition.enum(["PENDING", "ACCEPTED"]),
        direction: filterDefinition.enum(["INCOMING", "OUTGOING"], ["eq"])
    },
    "student friendships",
    "Structured friendship filters. Use filter[status]=PENDING or filter[direction]=INCOMING.",
    { status: "PENDING" }
);
export const studentFriendshipSort = defineSort({
    resourceName: "student friendships",
    sortableFields: ["updatedAt", "status"] as const,
    defaultSort: [{ field: "updatedAt", direction: "desc" }] as const,
    tieBreakers: [{ field: "id", direction: "asc" }] as const
});
export type StudentFriendshipFilter = Filter;

const friendshipsPath = [
    pathSeg.literal("student"),
    pathSeg.param("sid"),
    pathSeg.literal("friendships")
];
const read = policies.studentAccess("sid", StudentCapabilities.SOCIAL_READ);
const write = policies.studentAccess("sid", StudentCapabilities.SOCIAL_WRITE);

const listFriendships = {
    meta: {
        operationId: "listStudentFriendships",
        sdk: {
            resource: "studentSocial",
            method: "listFriendships",
            action: "list" as const,
            pathParameters: { sid: "studentId" }
        },
        method: "get" as const,
        path: friendshipsPath,
        tags: ["student-social"],
        authorization: read,
        queryFeatures: { filter: true, sort: true },
        pagination: unpaginatedByDefault
    },
    request: z.object({
        path: sidPath,
        query: createPaginationQuerySchema(unpaginatedByDefault, {
            filter: friendshipFilter.optional(),
            sort: resourceSortSchema(studentFriendshipSort).optional()
        })
            .strict()
            .openapi("ListStudentFriendshipsQuery", {
                "x-pomi-schema": {
                    kind: "input",
                    publicName: "ListStudentFriendshipsQuery"
                }
            })
    }),
    response: new OutputBuilder()
        .ok(getPaginatedSchema(friendship), "Amizades recuperadas")
        .build()
} satisfies IO;
const createFriendship = {
    meta: {
        operationId: "createStudentFriendship",
        sdk: {
            resource: "studentSocial",
            method: "createFriendship",
            action: "create" as const,
            pathParameters: { sid: "studentId" }
        },
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
        operationId: "acceptStudentFriendship",
        sdk: {
            resource: "studentSocial",
            method: "acceptFriendship",
            action: "update" as const,
            pathParameters: { sid: "studentId", id: "friendshipId" }
        },
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
        operationId: "deleteStudentFriendship",
        sdk: {
            resource: "studentSocial",
            method: "removeFriendship",
            action: "delete" as const,
            pathParameters: { sid: "studentId", id: "friendshipId" }
        },
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
    listFriendships,
    createFriendship,
    acceptFriendship,
    removeFriendship
};
