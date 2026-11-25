import { policies, UserCapabilities } from "#/Authorization.js";
import { OutputBuilder, type IO } from "#/Contract.js";
import {
    createPaginationQuerySchema,
    defineSort,
    getPaginatedSchema,
    pathSeg,
    ResourceNotFoundProblemSchema,
    resourceSortSchema,
    type PaginationPolicy
} from "@pomi/api-core";
import z from "zod";
import { person, publicIdPath, sidPath } from "../Social.schemas.js";

export const studentPeopleSort = defineSort({
    resourceName: "student people",
    sortableFields: ["displayName"] as const,
    defaultSort: [{ field: "displayName", direction: "asc" }] as const,
    tieBreakers: [{ field: "id", direction: "asc" }] as const
});
export const studentPeoplePagination = {
    defaultMode: "page",
    defaultPageSize: 20,
    maxPageSize: 50,
    allowAll: false
} satisfies PaginationPolicy;

const peoplePath = [
    pathSeg.literal("users"),
    pathSeg.param("userId"),
    pathSeg.literal("people")
];
const read = policies.userAccess("userId", UserCapabilities.SOCIAL_READ);

const listPeople = {
    meta: {
        operationId: "listUserPeople",
        method: "get" as const,
        path: peoplePath,
        tags: ["student-social"],
        authorization: read,
        queryFeatures: { sort: true },
        sdk: {
            resource: "userPeople",
            action: "list" as const,
            method: "list",
            pathParameters: { userId: "userId" }
        },
        pagination: studentPeoplePagination
    },
    request: z.object({
        path: sidPath,
        query: createPaginationQuerySchema(studentPeoplePagination, {
            query: z.string().trim().min(1).optional(),
            sort: resourceSortSchema(studentPeopleSort).optional()
        })
    }),
    response: new OutputBuilder()
        .ok(
            getPaginatedSchema(person).openapi("UserPeoplePage", {
                "x-pomi-schema": {
                    kind: "page",
                    publicName: "UserPeoplePage"
                }
            }),
            "Pessoas recuperadas"
        )
        .build()
} satisfies IO;
const getPerson = {
    meta: {
        operationId: "getUserPerson",
        sdk: {
            resource: "userSocial",
            method: "getPerson",
            action: "get" as const,
            pathParameters: { userId: "userId", publicId: "publicId" }
        },
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
export default { listPeople, getPerson };
