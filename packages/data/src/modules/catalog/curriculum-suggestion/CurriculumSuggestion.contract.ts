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
    ResourceNotFoundProblemSchema,
    resourceSortSchema,
    SpecBuilder,
    unpaginatedByDefault,
    type Filter
} from "@pomi/api-core";
import z from "zod";

extendZodWithOpenApi(z);

const basePath = [pathSeg.literal("curriculum-suggestions")];
const tags = ["curriculum-suggestions"];
const specsBuilder = new SpecBuilder(basePath, tags, "id", {
    resource: "curriculumSuggestions",
    operationName: "CurriculumSuggestions",
    pathParameters: { id: "curriculumSuggestionId" }
});

const positiveId = z.number().int().positive();
const catalogYear = z.number().int().min(1900).max(2100);
const specializationSummary = z
    .object({
        id: positiveId,
        code: z.string().trim().min(1),
        name: z.string().trim().min(1)
    })
    .strict();

const suggestionCourseEntitySchema = z
    .object({
        id: positiveId,
        code: z.string().trim().min(1),
        name: z.string().trim().min(1),
        credits: z.number().int().min(0)
    })
    .strict()
    .openapi("CurriculumSuggestionCourseEntity", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "CurriculumSuggestionCourse",
            identityFields: ["id"]
        }
    });

const semesterSuggestionEntitySchema = z
    .object({
        semester: z.number().int().positive(),
        electiveCredits: z.number().int().min(0),
        courses: z.array(suggestionCourseEntitySchema)
    })
    .strict()
    .openapi("SemesterSuggestionEntity", {
        "x-pomi-schema": { kind: "entity", publicName: "SemesterSuggestion" }
    });

export const curriculumSuggestionDataSchema = z
    .object({
        id: positiveId,
        catalogProgramVariantId: positiveId,
        catalogProgramId: positiveId,
        catalogYear,
        programId: positiveId,
        programCode: z.number().int().positive(),
        programName: z.string().trim().min(1),
        specialization: specializationSummary.nullable(),
        semesters: z.array(semesterSuggestionEntitySchema)
    })
    .strict()
    .openapi("CurriculumSuggestionData", {
        "x-pomi-schema": {
            kind: "projection",
            publicName: "CurriculumSuggestionData"
        }
    });

export type CurriculumSuggestionFilter = Filter;
const curriculumSuggestionFilterDefinitions = {
    catalogProgramId: filterDefinition.id({ positive: true }),
    catalogProgramVariantId: filterDefinition.id({ positive: true }),
    catalogId: filterDefinition.id({ positive: true }),
    catalogYear: filterDefinition.integer({ minimum: 1900 }),
    programId: filterDefinition.id({ positive: true }),
    programCode: filterDefinition.integer({ minimum: 1 }),
    specializationId: filterDefinition.id({ positive: true })
};
export type CurriculumSuggestionFilterName =
    keyof typeof curriculumSuggestionFilterDefinitions;
const curriculumSuggestionFilter = resourceFilterSchema(
    curriculumSuggestionFilterDefinitions,
    "curriculum suggestions",
    "Structured curriculum suggestion filters. Use bracket notation such as filter[catalogYear]=2025."
);
export const curriculumSuggestionSort = defineSort({
    resourceName: "curriculum suggestions",
    sortableFields: [
        "catalogYear",
        "programCode",
        "programName",
        "specializationCode"
    ] as const,
    defaultSort: [
        { field: "catalogYear", direction: "desc" },
        { field: "programCode", direction: "desc" },
        { field: "specializationCode", direction: "asc" }
    ] as const,
    tieBreakers: [{ field: "id", direction: "asc" }] as const
});

const curriculumSuggestionEntitySchema = curriculumSuggestionDataSchema
    .strict()
    .openapi("CurriculumSuggestionEntity", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "CurriculumSuggestion",
            identityFields: ["id"]
        }
    });

const listQuerySchema = createPaginationQuerySchema(unpaginatedByDefault, {
    filter: curriculumSuggestionFilter.optional(),
    sort: resourceSortSchema(curriculumSuggestionSort).optional()
})
    .strict()
    .openapi("ListCurriculumSuggestionsQuery", {
        "x-pomi-schema": {
            kind: "input",
            publicName: "ListCurriculumSuggestionsQuery"
        }
    });

const get = {
    meta: { ...specsBuilder.get(), authorization: policies.public },
    request: z.object({
        path: z.object({ id: pathParam.positiveInteger() }).strict()
    }),
    response: new OutputBuilder()
        .ok(
            curriculumSuggestionEntitySchema,
            "Curriculum suggestion retrieved successfully"
        )
        .problem(
            404,
            ResourceNotFoundProblemSchema,
            "Sugestão de currículo não encontrada"
        )
        .build()
} satisfies IO;

const list = {
    meta: {
        ...specsBuilder.list(),
        authorization: policies.public,
        queryFeatures: { filter: true, sort: true },
        pagination: unpaginatedByDefault
    },
    request: z.object({ query: listQuerySchema }),
    response: new OutputBuilder()
        .ok(
            getPaginatedSchema(curriculumSuggestionEntitySchema),
            "List of curriculum suggestions retrieved successfully"
        )
        .badRequest()
        .build()
} satisfies IO;

export default {
    schema: curriculumSuggestionEntitySchema,
    get,
    list,
    schemas: {
        suggestionCourseEntitySchema,
        semesterSuggestionEntitySchema,
        curriculumSuggestionDataSchema,
        specializationSummary,
        curriculumSuggestionEntitySchema,
        listQuerySchema
    }
};

export type CurriculumSuggestionEntity = z.infer<
    typeof curriculumSuggestionEntitySchema
>;
export type ListCurriculumSuggestionsQuery = z.infer<typeof listQuerySchema>;
