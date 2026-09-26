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

const basePath = [pathSeg.literal("catalog-program")];
const tags = ["catalog-program"];
const specsBuilder = new SpecBuilder(basePath, tags, "id", {
    resource: "catalogPrograms",
    operationName: "CatalogPrograms",
    pathParameters: { id: "catalogProgramId" }
});

export const CourseBlockType = {
    mandatory: "mandatory",
    elective: "elective"
} as const;

const prefixCourseRequirementDetailsSchema = z
    .object({ value: z.string().min(1) })
    .openapi("PrefixCourseRequirementDetails", {
        "x-pomi-schema": {
            kind: "value-object",
            publicName: "PrefixCourseRequirementDetails"
        }
    });

const specificCourseRequirementDetailsSchema = z
    .object({
        courseId: z.number().int(),
        courseCode: z.string(),
        courseName: z.string(),
        catalogCourseId: z.number().int().nullable()
    })
    .openapi("SpecificCourseRequirementDetails", {
        "x-pomi-schema": {
            kind: "value-object",
            publicName: "SpecificCourseRequirementDetails",
            relations: {
                catalogCourseId: {
                    resource: "catalogCourses",
                    cardinality: "one",
                    nullable: true
                }
            }
        }
    });

const anyCourseRequirementSchema = z
    .object({ id: z.number().int(), type: z.literal("any") })
    .openapi("AnyCourseRequirement", {
        "x-pomi-schema": {
            kind: "variant",
            publicName: "AnyCourseRequirement",
            identityFields: ["id"]
        }
    });

const prefixCourseRequirementSchema = z
    .object({
        id: z.number().int(),
        type: z.literal("prefix"),
        prefix: prefixCourseRequirementDetailsSchema
    })
    .openapi("PrefixCourseRequirement", {
        "x-pomi-schema": {
            kind: "variant",
            publicName: "PrefixCourseRequirement",
            identityFields: ["id"]
        }
    });

const specificCourseRequirementSchema = z
    .object({
        id: z.number().int(),
        type: z.literal("specific"),
        specific: specificCourseRequirementDetailsSchema
    })
    .openapi("SpecificCourseRequirement", {
        "x-pomi-schema": {
            kind: "variant",
            publicName: "SpecificCourseRequirement",
            identityFields: ["id"]
        }
    });

const courseRequirementSchema = z
    .discriminatedUnion("type", [
        anyCourseRequirementSchema,
        prefixCourseRequirementSchema,
        specificCourseRequirementSchema
    ])
    .openapi("CourseRequirement", {
        "discriminator": {
            propertyName: "type",
            mapping: {
                any: "#/components/schemas/AnyCourseRequirement",
                prefix: "#/components/schemas/PrefixCourseRequirement",
                specific: "#/components/schemas/SpecificCourseRequirement"
            }
        },
        "x-pomi-schema": {
            kind: "entity",
            publicName: "CourseRequirement",
            identityFields: ["id"]
        }
    });

const electiveBlockSchema = z
    .object({
        credits: z.number().int(),
        courses: z.array(courseRequirementSchema)
    })
    .openapi("ElectiveBlock", {
        "x-pomi-schema": { kind: "value-object", publicName: "ElectiveBlock" }
    });

const courseBlockSetSchema = z
    .object({
        mandatory: z.array(courseRequirementSchema),
        electives: z.array(electiveBlockSchema)
    })
    .openapi("CourseBlockSet", {
        "x-pomi-schema": { kind: "value-object", publicName: "CourseBlockSet" }
    });

const catalogProgramVariantSharedFields = {
    id: z.number().int(),
    curriculumSuggestionId: z.number().int().nullable(),
    code: z.string(),
    name: z.string(),
    integralizationCredits: z.number().int().nullable(),
    integralizationSupervisedHours: z.number().int().nullable(),
    integralizationExtensionHours: z.number().int().nullable(),
    integralizationSemesters: z.number().int().nullable(),
    integralizationMaximumSemesters: z.number().int().nullable(),
    professionalDescription: z.string().nullable(),
    recognitionDescription: z.string().nullable(),
    blocks: courseBlockSetSchema
};

const programCatalogProgramVariantSchema = z
    .object({
        ...catalogProgramVariantSharedFields,
        type: z.literal("PROGRAM"),
        program: z.object({ programId: z.number().int() })
    })
    .openapi("ProgramCatalogProgramVariant", {
        "x-pomi-schema": {
            kind: "variant",
            publicName: "ProgramCatalogProgramVariant",
            identityFields: ["id"],
            relations: {
                curriculumSuggestionId: {
                    resource: "curriculumSuggestions",
                    cardinality: "one",
                    nullable: true
                }
            }
        }
    });

const specializationCatalogProgramVariantSchema = z
    .object({
        ...catalogProgramVariantSharedFields,
        type: z.literal("SPECIALIZATION"),
        specialization: z.object({ specializationId: z.number().int() })
    })
    .openapi("SpecializationCatalogProgramVariant", {
        "x-pomi-schema": {
            kind: "variant",
            publicName: "SpecializationCatalogProgramVariant",
            identityFields: ["id"],
            relations: {
                curriculumSuggestionId: {
                    resource: "curriculumSuggestions",
                    cardinality: "one",
                    nullable: true
                }
            }
        }
    });

const catalogProgramVariantSchema = z
    .discriminatedUnion("type", [
        programCatalogProgramVariantSchema,
        specializationCatalogProgramVariantSchema
    ])
    .openapi("CatalogProgramVariant", {
        "discriminator": {
            propertyName: "type",
            mapping: {
                PROGRAM: "#/components/schemas/ProgramCatalogProgramVariant",
                SPECIALIZATION:
                    "#/components/schemas/SpecializationCatalogProgramVariant"
            }
        },
        "x-pomi-schema": {
            kind: "value-object",
            publicName: "CatalogProgramVariant"
        }
    });

const catalogProgramLanguageSchema = z
    .object({
        languageId: z.number().int(),
        name: z.string(),
        blocks: courseBlockSetSchema
    })
    .openapi("CatalogProgramLanguage", {
        "x-pomi-schema": {
            kind: "projection",
            publicName: "CatalogProgramLanguage"
        }
    });

const catalogProgramEntity = z
    .object({
        id: z.number().int(),
        catalogId: z.number().int(),
        programId: z.number().int(),
        title: z.string(),
        catalogYear: z.number().int(),
        programCode: z.number().int(),
        programName: z.string(),
        shift: z.enum(["DAYTIME", "NIGHT"]).nullable(),
        creditLimitType: z.enum(["NONE", "FIXED", "CR_FORMULA"]).nullable(),
        creditLimitFixedCredits: z.number().int().nullable(),
        creditLimitBeforeThresholdCredits: z.number().int().nullable(),
        creditLimitThresholdCredits: z.number().int().nullable(),
        creditLimitCrBase: z.number().int().nullable(),
        creditLimitCrMultiplier: z.number().nullable(),
        professionalPracticeDescription: z.string().nullable(),
        base: courseBlockSetSchema,
        variants: z.array(catalogProgramVariantSchema),
        languages: z.array(catalogProgramLanguageSchema)
    })
    .strict()
    .openapi("CatalogProgramEntity", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "CatalogProgram",
            identityFields: ["id"],
            relations: {
                catalogId: { resource: "catalogs", cardinality: "one" },
                programId: { resource: "programs", cardinality: "one" },
                variants: {
                    resource: "catalogProgramVariants",
                    cardinality: "many"
                },
                languages: { resource: "languages", cardinality: "many" }
            }
        }
    });

export type CatalogProgramFilter = Filter;

const catalogProgramFilterDefinitions = {
    catalogId: filterDefinition.id(),
    catalogYear: filterDefinition.integer(),
    programId: filterDefinition.id(),
    programCode: filterDefinition.integer()
};
export type CatalogProgramFilterName =
    keyof typeof catalogProgramFilterDefinitions;

const catalogProgramFilter = resourceFilterSchema(
    catalogProgramFilterDefinitions,
    "catalog programs",
    "Structured catalog program filters. Use bracket notation such as filter[catalogYear]=2025.",
    { catalogYear: 2025, programCode: 34 }
);
export const catalogProgramSort = defineSort({
    resourceName: "catalog programs",
    sortableFields: [
        "id",
        "catalogYear",
        "programCode",
        "programName",
        "title"
    ] as const,
    defaultSort: [{ field: "id", direction: "asc" }] as const,
    tieBreakers: [] as const
});

const get = {
    meta: { ...specsBuilder.get(), authorization: policies.public },
    request: z.object({
        path: z.object({
            id: pathParam.integer()
        })
    }),
    response: new OutputBuilder()
        .ok(catalogProgramEntity, "Catalog program retrieved successfully")
        .problem(
            404,
            ResourceNotFoundProblemSchema,
            "Programa de catálogo não encontrado"
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
    request: z.object({
        query: createPaginationQuerySchema(unpaginatedByDefault, {
            filter: catalogProgramFilter.optional(),
            sort: resourceSortSchema(catalogProgramSort).optional()
        }).strict()
    }),
    response: new OutputBuilder()
        .ok(
            getPaginatedSchema(catalogProgramEntity),
            "List of catalog programs retrieved successfully"
        )
        .build()
} satisfies IO;

export default {
    get,
    list,
    schemas: {
        catalogProgramEntity,
        catalogProgramVariantSchema,
        courseRequirementSchema,
        electiveBlockSchema,
        courseBlockSetSchema
    }
};
