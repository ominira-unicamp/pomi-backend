import { OutputBuilder, type IO } from "#/BuildHandler.js";
import { policies } from "#/auth.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
    createPaginationQuerySchema,
    defineSort,
    filterDefinition,
    getPaginatedSchema,
    pathParam,
    pathSeg,
    resourceFilterSchema,
    resourceSortSchema,
    SpecBuilder,
    unpaginatedByDefault,
    type Filter
} from "@pomi/api-core";
import z from "zod";

extendZodWithOpenApi(z);

export const roomPaths = {
    entity: (id: number) => `/rooms/${id}`
};

const basePath = [pathSeg.literal("rooms")];
const tags = ["rooms"];
const specsBuilder = new SpecBuilder(basePath, tags, "id", {
    resource: "rooms",
    operationName: "Rooms",
    pathParameters: { id: "roomId" }
});

const roomEntity = z
    .object({
        id: z.number().int(),
        code: z.string()
    })
    .strict()
    .openapi("RoomEntity", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "Room",
            identityFields: ["id"]
        }
    });

export type RoomFilter = Filter;
const roomFilterDefinitions = {
    id: filterDefinition.id(),
    code: filterDefinition.code()
};
export type RoomFilterName = keyof typeof roomFilterDefinitions;
const roomFilter = resourceFilterSchema(
    roomFilterDefinitions,
    "rooms",
    "Structured room filters. Use bracket notation such as filter[code]=PB01."
);

export const roomSort = defineSort({
    resourceName: "rooms",
    sortableFields: ["code"] as const,
    defaultSort: [{ field: "code", direction: "asc" }] as const,
    tieBreakers: [{ field: "id", direction: "asc" }] as const
});

const get = {
    meta: { ...specsBuilder.get(), authorization: policies.public },
    request: z.object({
        path: z.object({
            id: pathParam.integer()
        })
    }),
    response: new OutputBuilder()
        .ok(roomEntity, "Room retrieved successfully")
        .notFound()
        .build()
} satisfies IO;

const list = {
    meta: {
        ...specsBuilder.list(),
        authorization: policies.public,
        queryFeatures: { filter: true, sort: true },
        pagination: unpaginatedByDefault
    },
    request: z.object({
        query: createPaginationQuerySchema(unpaginatedByDefault, {
            filter: roomFilter.optional(),
            sort: resourceSortSchema(roomSort).optional()
        }).strict()
    }),
    response: new OutputBuilder()
        .ok(
            getPaginatedSchema(roomEntity),
            "List of rooms retrieved successfully"
        )
        .build()
} satisfies IO;

export default {
    schema: roomEntity,
    get,
    list
};
