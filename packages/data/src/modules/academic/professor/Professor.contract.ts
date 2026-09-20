import { OutputBuilder, type IO } from "#/BuildHandler.js";
import { policies } from "#/auth.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
    defineSort,
    filterDefinition,
    getPaginatedSchema,
    paginatedByDefault,
    paginationQuerySchema,
    pathParam,
    pathSeg,
    resourceFilterSchema,
    resourceSortSchema,
    SpecBuilder,
    type Filter
} from "@pomi/api-core";
import z from "zod";

extendZodWithOpenApi(z);

export const professorPaths = {
    entity: (id: number) => `/professors/${id}`
};

const basePath = [pathSeg.literal("professors")];
const tags = ["professors"];
const specsBuilder = new SpecBuilder(basePath, tags, "id", {
    resource: "professors",
    operationName: "Professors",
    pathParameters: { id: "professorId" }
});

const professorEntity = z
    .object({
        id: z.number().int(),
        name: z.string(),
        _paths: z.object({
            entity: z.string(),
            dataPortalProfile: z.string().nullable()
        })
    })
    .strict()
    .openapi("ProfessorEntity", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "Professor",
            identityFields: ["id"],
            transportFields: ["_paths"]
        }
    });

export type ProfessorFilter = Filter;
const professorFilterDefinitions = { classId: filterDefinition.id() };
export type ProfessorFilterName = keyof typeof professorFilterDefinitions;
const professorFilter = resourceFilterSchema(
    professorFilterDefinitions,
    "professors",
    "Structured professor filters. Use bracket notation such as filter[classId]=1."
);

export const professorSort = defineSort({
    resourceName: "professors",
    sortableFields: ["name"] as const,
    defaultSort: [{ field: "name", direction: "asc" }] as const,
    tieBreakers: [{ field: "id", direction: "asc" }] as const
});

const listProfessorsQuery = paginationQuerySchema
    .extend({
        filter: professorFilter.optional(),
        sort: resourceSortSchema(professorSort).optional()
    })
    .strict()
    .openapi("ListProfessorsQuery", {
        "x-pomi-schema": { kind: "input", publicName: "ListProfessorsQuery" }
    });

const PageProfessorsSchema = getPaginatedSchema(professorEntity).openapi(
    "PageProfessors",
    {
        "x-pomi-schema": {
            kind: "page",
            publicName: "PageProfessors",
            transportFields: ["_paths"]
        }
    }
);

const get = {
    meta: { ...specsBuilder.get(), authorization: policies.public },
    request: z.object({
        path: z.object({
            id: pathParam.integer()
        })
    }),
    response: new OutputBuilder()
        .ok(professorEntity, "Professor retrieved successfully")
        .notFound()
        .build()
} satisfies IO;

const list = {
    meta: {
        ...specsBuilder.list(),
        authorization: policies.public,
        queryFeatures: { filter: true, sort: true },
        pagination: paginatedByDefault
    },
    request: z.object({
        query: listProfessorsQuery
    }),
    response: new OutputBuilder()
        .ok(PageProfessorsSchema, "List of professors retrieved successfully")
        .badRequest()
        .build()
} satisfies IO;

export default {
    schema: professorEntity,
    get,
    list
};

export type ListQueryParams = Partial<z.infer<typeof listProfessorsQuery>>;
