import { OutputBuilder, type IO } from "#/BuildHandler.js";
import { policies } from "#/auth.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
    createPaginationQuerySchema,
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
    unpaginatedByDefault,
    type Filter
} from "@pomi/api-core";
import z from "zod";

extendZodWithOpenApi(z);

const profileBase = [pathSeg.literal("professor-data-portal-profiles")];
const profileSpecs = new SpecBuilder(
    profileBase,
    ["professor-data-portal"],
    "id",
    {
        resource: "professorDataPortalProfiles",
        operationName: "ProfessorDataPortalProfiles",
        pathParameters: { id: "profileId" }
    }
);
const idPath = z.object({
    id: pathParam.positiveInteger()
});
const profileId = z.number().int().positive();
const careerReference = z
    .object({
        career: z.string(),
        code: z.string(),
        rank: z.string().nullable(),
        category: z.string().nullable(),
        progressionOrder: z.number().int()
    })
    .strict()
    .openapi("CareerReference", {
        "x-pomi-schema": { kind: "entity", publicName: "CareerReference" }
    });
const position = z
    .object({
        id: profileId,
        canonicalKey: z.string(),
        role: z.string(),
        affiliationType: z.string(),
        programCode: z.string().nullable(),
        postdoctoralModality: z.string().nullable(),
        careerReference: careerReference.nullable()
    })
    .strict()
    .openapi("ProfessorPosition", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "ProfessorPosition",
            identityFields: ["id"]
        }
    });
const unit = z
    .object({ id: profileId, code: z.string(), name: z.string() })
    .strict();
const department = z
    .object({ id: profileId, name: z.string(), unitId: profileId })
    .strict()
    .openapi("Department", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "Department",
            identityFields: ["id"]
        }
    });
const identifier = z
    .object({ id: profileId, system: z.string(), externalId: z.string() })
    .strict();
const citationName = z.object({ id: profileId, name: z.string() }).strict();
const training = z
    .object({
        id: profileId,
        degree: z.string(),
        institutionName: z.string(),
        startYear: z.number().int().nullable(),
        endYear: z.number().int().nullable()
    })
    .strict();
const keyword = z
    .object({
        id: profileId,
        name: z.string(),
        count: z.number().int().nullable()
    })
    .strict();
const coauthor = z
    .object({
        id: profileId,
        name: z.string(),
        count: z.number().int().nullable()
    })
    .strict();

const profile = z
    .object({
        id: profileId,
        professorId: profileId,
        portalId: profileId,
        name: z.string(),
        email: z.string().nullable(),
        lattesAbstract: z.string().nullable(),
        unit,
        department: department.nullable(),
        position: position.nullable(),
        identifiers: z.array(identifier),
        citationNames: z.array(citationName),
        trainings: z.array(training),
        keywords: z.array(keyword),
        coauthors: z.array(coauthor)
    })
    .strict()
    .openapi("ProfessorDataPortalProfile", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "ProfessorDataPortalProfile",
            identityFields: ["id"]
        }
    });
export const profileSummary = profile
    .pick({
        id: true,
        professorId: true,
        portalId: true,
        name: true,
        email: true,
        lattesAbstract: true,
        unit: true,
        department: true,
        position: true
    })
    .openapi("ProfessorDataPortalProfileSummary", {
        "x-pomi-schema": {
            kind: "projection",
            publicName: "ProfessorDataPortalProfileSummary"
        }
    });

export type ProfileFilter = Filter;
const profileFilterDefinitions = {
    professorId: filterDefinition.id({ positive: true }),
    portalId: filterDefinition.id({ positive: true }),
    unitId: filterDefinition.id({ positive: true }),
    departmentId: filterDefinition.id({ positive: true }),
    positionId: filterDefinition.id({ positive: true }),
    name: filterDefinition.code({ operators: ["eq"] })
};
export type ProfileFilterName = keyof typeof profileFilterDefinitions;
const profileFilter = resourceFilterSchema(
    profileFilterDefinitions,
    "professor data portal profiles",
    "Structured profile filters. Use bracket notation such as filter[unitId]=1."
);
const nameFilter = resourceFilterSchema(
    { name: filterDefinition.code({ operators: ["eq"] }) },
    "named professor data portal resources",
    "Structured name filters. Use bracket notation such as filter[name]=Ada."
);
const departmentFilter = resourceFilterSchema(
    {
        unitId: filterDefinition.id({ positive: true }),
        name: filterDefinition.code({ operators: ["eq"] })
    },
    "departments",
    "Structured department filters. Use bracket notation such as filter[unitId]=1."
);
const positionFilter = resourceFilterSchema(
    {
        id: filterDefinition.id({ positive: true }),
        canonicalKey: filterDefinition.code({ operators: ["eq"] }),
        role: filterDefinition.enum([
            "PROFESSOR",
            "RESEARCHER",
            "POSTDOCTORAL_RESEARCHER"
        ])
    },
    "professor positions",
    "Structured professor position filters. Use bracket notation such as filter[role]=Professor."
);
export const profileSort = defineSort({
    resourceName: "professor data portal profiles",
    sortableFields: ["name"] as const,
    defaultSort: [{ field: "name", direction: "asc" }] as const,
    tieBreakers: [{ field: "id", direction: "asc" }] as const
});
export const positionSort = defineSort({
    resourceName: "professor positions",
    sortableFields: ["canonicalKey", "role"] as const,
    defaultSort: [{ field: "canonicalKey", direction: "asc" }] as const,
    tieBreakers: [{ field: "id", direction: "asc" }] as const
});
export const departmentSort = defineSort({
    resourceName: "departments",
    sortableFields: ["name"] as const,
    defaultSort: [{ field: "name", direction: "asc" }] as const,
    tieBreakers: [{ field: "id", direction: "asc" }] as const
});
export const keywordSort = defineSort({
    resourceName: "keywords",
    sortableFields: ["name"] as const,
    defaultSort: [{ field: "name", direction: "asc" }] as const,
    tieBreakers: [{ field: "id", direction: "asc" }] as const
});
export const coauthorSort = defineSort({
    resourceName: "coauthors",
    sortableFields: ["name"] as const,
    defaultSort: [{ field: "name", direction: "asc" }] as const,
    tieBreakers: [{ field: "id", direction: "asc" }] as const
});

const profileList = {
    meta: {
        ...profileSpecs.list(),
        authorization: policies.public,
        queryFeatures: { filter: true, sort: true },
        pagination: paginatedByDefault
    },
    request: z.object({
        query: paginationQuerySchema
            .extend({
                filter: profileFilter.optional(),
                sort: resourceSortSchema(profileSort).optional()
            })
            .strict()
    }),
    response: new OutputBuilder()
        .ok(
            getPaginatedSchema(profileSummary),
            "Profiles retrieved successfully"
        )
        .badRequest()
        .build()
} satisfies IO;
const profileGet = {
    meta: { ...profileSpecs.get(), authorization: policies.public },
    request: z.object({ path: idPath }),
    response: new OutputBuilder()
        .ok(profile, "Profile retrieved successfully")
        .notFound()
        .build()
} satisfies IO;

const simpleList = (
    path: string,
    tag: string,
    resource: string,
    operationName: string,
    identifierName: string,
    schema: z.ZodTypeAny,
    filter: z.ZodType<Filter> | undefined,
    sort: import("@pomi/api-core").SortDefinition
) => ({
    meta: {
        ...new SpecBuilder([pathSeg.literal(path)], [tag], "id", {
            resource,
            operationName,
            pathParameters: { id: identifierName }
        }).list(),
        authorization: policies.public,
        queryFeatures: { ...(filter ? { filter: true } : {}), sort: true },
        pagination: unpaginatedByDefault
    },
    request: z.object({
        query: createPaginationQuerySchema(unpaginatedByDefault, {
            ...(filter ? { filter: filter.optional() } : {}),
            sort: resourceSortSchema(sort).optional()
        }).strict()
    }),
    response: new OutputBuilder()
        .ok(getPaginatedSchema(schema), `${tag} retrieved successfully`)
        .badRequest()
        .build()
});
const simpleGet = (
    path: string,
    tag: string,
    resource: string,
    operationName: string,
    identifierName: string,
    schema: z.ZodTypeAny
) => ({
    meta: {
        ...new SpecBuilder([pathSeg.literal(path)], [tag], "id", {
            resource,
            operationName,
            pathParameters: { id: identifierName }
        }).get(),
        authorization: policies.public
    },
    request: z.object({ path: idPath }),
    response: new OutputBuilder()
        .ok(schema, `${tag} retrieved successfully`)
        .notFound()
        .build()
});

export const positionSchema = position;
export const departmentSchema = department;
export const keywordSchema = z
    .object({ id: profileId, name: z.string() })
    .strict()
    .openapi("Keyword", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "Keyword",
            identityFields: ["id"]
        }
    });
export const coauthorSchema = z
    .object({ id: profileId, name: z.string() })
    .strict()
    .openapi("Coauthor", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "Coauthor",
            identityFields: ["id"]
        }
    });
const keywordList = {
    meta: {
        ...new SpecBuilder([pathSeg.literal("keywords")], ["keywords"], "id", {
            resource: "keywords",
            operationName: "Keywords",
            pathParameters: { id: "keywordId" }
        }).list(),
        authorization: policies.public,
        queryFeatures: { filter: true, sort: true },
        pagination: paginatedByDefault
    },
    request: z.object({
        query: paginationQuerySchema
            .extend({
                filter: nameFilter.optional(),
                sort: resourceSortSchema(keywordSort).optional()
            })
            .strict()
    }),
    response: new OutputBuilder()
        .ok(
            getPaginatedSchema(keywordSchema),
            "Keywords retrieved successfully"
        )
        .badRequest()
        .build()
};
const coauthorList = {
    meta: {
        ...new SpecBuilder(
            [pathSeg.literal("coauthors")],
            ["coauthors"],
            "id",
            {
                resource: "coauthors",
                operationName: "Coauthors",
                pathParameters: { id: "coauthorId" }
            }
        ).list(),
        authorization: policies.public,
        queryFeatures: { filter: true, sort: true },
        pagination: paginatedByDefault
    },
    request: z.object({
        query: paginationQuerySchema
            .extend({
                filter: nameFilter.optional(),
                sort: resourceSortSchema(coauthorSort).optional()
            })
            .strict()
    }),
    response: new OutputBuilder()
        .ok(
            getPaginatedSchema(coauthorSchema),
            "Coauthors retrieved successfully"
        )
        .badRequest()
        .build()
};
export default {
    profile: { schema: profile, list: profileList, get: profileGet },
    positions: {
        list: simpleList(
            "professor-positions",
            "professor-positions",
            "professorPositions",
            "ProfessorPositions",
            "professorPositionId",
            position,
            positionFilter,
            positionSort
        ),
        get: simpleGet(
            "professor-positions",
            "professor-positions",
            "professorPositions",
            "ProfessorPositions",
            "professorPositionId",
            position
        )
    },
    departments: {
        list: simpleList(
            "departments",
            "departments",
            "departments",
            "Departments",
            "departmentId",
            department,
            departmentFilter,
            departmentSort
        ),
        get: simpleGet(
            "departments",
            "departments",
            "departments",
            "Departments",
            "departmentId",
            department
        )
    },
    keywords: {
        list: keywordList,
        get: simpleGet(
            "keywords",
            "keywords",
            "keywords",
            "Keywords",
            "keywordId",
            keywordSchema
        )
    },
    coauthors: {
        list: coauthorList,
        get: simpleGet(
            "coauthors",
            "coauthors",
            "coauthors",
            "Coauthors",
            "coauthorId",
            coauthorSchema
        )
    }
};
