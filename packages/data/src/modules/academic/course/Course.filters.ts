import {
    extendZodWithOpenApi,
    OpenApiGeneratorV3
} from "@asteasolutions/zod-to-openapi";
import {
    equalityOperators,
    filterDefinition,
    resourceFilterOpenApiMetadata,
    resourceFilterOpenApiSchema,
    resourceFilterSchema,
    type Filter,
    type PomiFilterMetadata
} from "@pomi/api-core";
import z from "zod";

extendZodWithOpenApi(z);

export const legacyCourseFilterDefinitions = {
    "catalogYear": filterDefinition.integer(),
    "code": filterDefinition.code(),
    "credits": filterDefinition.integer({
        minimum: 0,
        operators: ["eq", "ne", "gt", "gte", "lt", "lte", "in"]
    }),
    "tagId": filterDefinition.id({ positive: true }),
    "unit.code": filterDefinition.code({ operators: equalityOperators }),
    "unit.id": filterDefinition.id({ positive: true })
};
export type LegacyCourseFilterName = keyof typeof legacyCourseFilterDefinitions;
const legacy = resourceFilterSchema(
    legacyCourseFilterDefinitions,
    "courses",
    "Course filters"
);

export const courseWorkloadFields = [
    "theoreticalHours",
    "practicalHours",
    "laboratoryHours",
    "guidedActivityHours",
    "distanceHours",
    "guidedExtensionHours",
    "practicalExtensionHours",
    "weeklyClassHours",
    "classroomHours"
] as const;
const numberValue = (minimum?: number, maximum?: number) =>
    z
        .preprocess(
            (value) =>
                typeof value === "string" && value.trim() !== ""
                    ? Number(value)
                    : value,
            z
                .number()
                .int()
                .min(minimum ?? Number.MIN_SAFE_INTEGER)
                .max(maximum ?? Number.MAX_SAFE_INTEGER)
        )
        .openapi({
            type: "integer",
            ...(minimum === undefined ? {} : { minimum }),
            ...(maximum === undefined ? {} : { maximum })
        });
const booleanValue = z
    .preprocess(
        (value) =>
            value === "true" ? true : value === "false" ? false : value,
        z.boolean()
    )
    .openapi({ type: "boolean" });
const textValue = z.string().trim().min(1);
const numericOps = [
    "eq",
    "ne",
    "in",
    "notIn",
    "gt",
    "gte",
    "lt",
    "lte"
] as const;
const enumOps = ["eq", "ne", "in", "notIn"] as const;
function field(
    value: z.ZodType,
    operators: readonly string[],
    nullable = false
) {
    const shape: Record<string, z.ZodType> = {};
    for (const operator of operators)
        shape[operator] = (
            ["in", "notIn"].includes(operator)
                ? z.preprocess(
                      (item) =>
                          typeof item === "string" ||
                          typeof item === "number" ||
                          typeof item === "boolean"
                              ? [item]
                              : item,
                      z.array(value).min(1).max(100)
                  )
                : value
        ).optional();
    if (nullable) shape.isNull = booleanValue.optional();
    const object = z
        .object(shape)
        .strict()
        .refine(
            (value) => Object.keys(value).length > 0,
            "Informe ao menos um operador."
        )
        .openapi({ minProperties: 1 });
    return operators.includes("eq") ? z.union([value, object]) : object;
}
const id = (nullable = false, operators: readonly string[] = enumOps) =>
    field(numberValue(1), operators, nullable);
const numeric = (
    minimum?: number,
    maximum?: number,
    nullable = false,
    operators: readonly string[] = numericOps
) => field(numberValue(minimum, maximum), operators, nullable);
const enumerable = (
    values: readonly [string, ...string[]],
    nullable = false,
    operators: readonly string[] = enumOps
) => field(z.enum(values), operators, nullable);
const text = (nullable = false) => field(textValue, ["contains"], nullable);
const matchOps = ["eq", "in"] as const;
const courseMatch = z
    .object({
        courseId: id(false, matchOps).optional(),
        courseCode: field(textValue, matchOps).optional(),
        fulfillment: enumerable(["FULL", "PARTIAL"], false, matchOps).optional()
    })
    .strict()
    .refine((value) => Object.keys(value).length > 0, "Predicado vazio.");
const authorizationMatch = z
    .object({ type: field(z.literal("AUTHORIZATION"), matchOps) })
    .strict();
const progressionMatch = z
    .object({
        type: field(z.literal("PROGRESSION_COEFFICIENT"), matchOps),
        progressionCoefficient: z
            .object({
                value: numeric(0, 100, false, [
                    "eq",
                    "in",
                    "gt",
                    "gte",
                    "lt",
                    "lte"
                ])
            })
            .strict()
            .optional()
    })
    .strict();
const specialMatch = z.union([
    authorizationMatch,
    progressionMatch,
    z
        .object({
            type: enumerable(
                ["AUTHORIZATION", "PROGRESSION_COEFFICIENT"],
                false,
                matchOps
            )
        })
        .strict()
]);
const predicate = z.union([
    z.object({ course: courseMatch }).strict(),
    z.object({ specialRequirement: specialMatch }).strict()
]);
const predicateList = z.array(predicate).min(1).max(20);
const latest = z
    .object({
        isNull: booleanValue.optional(),
        catalogYear: numeric().optional(),
        offeringPeriod: enumerable(
            ["ALL_PERIODS", "ODD_PERIODS", "EVEN_PERIODS", "UNIT_DISCRETION"],
            true
        ).optional(),
        evaluation: enumerable(
            ["GRADE_AND_ATTENDANCE", "ATTENDANCE", "CONCEPT"],
            true
        ).optional(),
        finalExam: field(booleanValue, ["eq"], true).optional(),
        minimumAttendancePercent: numeric(0, 100, true).optional(),
        workload: z
            .object(
                Object.fromEntries(
                    courseWorkloadFields.map((name) => [
                        name,
                        numeric(0, undefined, true).optional()
                    ])
                )
            )
            .strict()
            .refine(
                (value) => Object.keys(value).length > 0,
                "Informe uma carga horária."
            )
            .optional(),
        coordinator: z
            .object({ id: id(true) })
            .strict()
            .optional(),
        name: text().optional(),
        syllabus: text(true).optional(),
        bibliography: text(true).optional(),
        hasPrerequisites: field(booleanValue, ["eq"]).optional(),
        prerequisites: z
            .object({
                some: predicateList.optional(),
                none: predicateList.optional()
            })
            .strict()
            .refine(
                (value) => Object.keys(value).length > 0,
                "Informe some ou none."
            )
            .optional()
    })
    .strict()
    .refine(
        (value) => Object.keys(value).length > 0,
        "Informe ao menos um filtro de catálogo."
    );

const generated = new OpenApiGeneratorV3([
    {
        type: "schema",
        schema: z
            .object({ latestCatalogCourse: latest.optional() })
            .strict()
            .openapi("CourseFilterInput")
    }
]).generateComponents();
const catalogSchema = generated.components?.schemas?.CourseFilterInput;
const legacySchema = resourceFilterOpenApiSchema(legacyCourseFilterDefinitions);
const schema = {
    ...legacySchema,
    properties: {
        ...legacySchema.properties,
        ...(catalogSchema && "properties" in catalogSchema
            ? catalogSchema.properties
            : {})
    }
};

function catalogMetadata() {
    const fields = new Map<string, PomiFilterMetadata["fields"][number]>();
    function visit(value: unknown, path: string[]) {
        if (!value || typeof value !== "object") return;
        const node = value as Record<string, unknown>;
        for (const variant of (node.anyOf ?? node.oneOf ?? []) as unknown[])
            visit(variant, path);
        if (node.items) visit(node.items, [...path, "*"]);
        const properties = (node.properties ?? {}) as Record<
            string,
            Record<string, unknown>
        >;
        const operators = Object.keys(properties).filter((key) =>
            [...numericOps, "contains", "isNull"].includes(key)
        );
        if (operators.length) {
            const key = path.join(".");
            const selected =
                properties.eq ??
                properties.contains ??
                properties[
                    operators.find((key) => key !== "isNull") ?? "isNull"
                ];
            const scalar =
                selected.type === "array" ? selected.items : selected;
            const existing = fields.get(key);
            const entry = {
                path,
                schema: scalar as PomiFilterMetadata["fields"][number]["schema"],
                operators:
                    operators as PomiFilterMetadata["fields"][number]["operators"]
            };
            if (existing) {
                entry.operators = [
                    ...new Set([...existing.operators, ...entry.operators])
                ];
                if (existing.schema.enum && entry.schema.enum)
                    entry.schema = {
                        ...entry.schema,
                        enum: [
                            ...new Set([
                                ...existing.schema.enum,
                                ...entry.schema.enum
                            ])
                        ]
                    };
            }
            fields.set(key, entry);
        }
        for (const [name, child] of Object.entries(properties))
            if (!operators.includes(name)) visit(child, [...path, name]);
    }
    if (schema && "properties" in schema)
        visit(schema.properties?.latestCatalogCourse, ["latestCatalogCourse"]);
    return [...fields.values()];
}

function flatten(value: unknown, path: string[], result: Filter) {
    if (Array.isArray(value)) {
        value.forEach((item, index) =>
            flatten(item, [...path, String(index)], result)
        );
    } else if (value !== null && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) {
            if ([...numericOps, "contains", "isNull"].includes(key)) {
                result.push({
                    path,
                    operator: key as Filter[number]["operator"],
                    values: (Array.isArray(child) ? child : [child]).map(
                        (item) =>
                            typeof item === "boolean" ? String(item) : item
                    )
                });
            } else flatten(child, [...path, key], result);
        }
    } else {
        result.push({
            path,
            operator: "eq",
            values: [
                typeof value === "boolean"
                    ? String(value)
                    : (value as string | number)
            ]
        });
    }
}

export const courseFilterSchema = z
    .unknown()
    .transform((input, context) => {
        if (
            input === null ||
            typeof input !== "object" ||
            Array.isArray(input)
        ) {
            const parsed = legacy.safeParse(input);
            if (!parsed.success)
                for (const issue of parsed.error.issues)
                    context.addIssue({ ...issue });
            return z.NEVER;
        }
        const { latestCatalogCourse, ...rest } = input as Record<
            string,
            unknown
        >;
        const result: Filter = [];
        if (Object.keys(rest).length || latestCatalogCourse === undefined) {
            const parsed = legacy.safeParse(rest);
            if (!parsed.success) {
                for (const issue of parsed.error.issues)
                    context.addIssue({ ...issue });
                return z.NEVER;
            }
            result.push(...parsed.data);
        }
        if (latestCatalogCourse !== undefined) {
            const parsed = latest.safeParse(latestCatalogCourse);
            if (!parsed.success) {
                for (const issue of parsed.error.issues)
                    context.addIssue({
                        ...issue,
                        path: ["latestCatalogCourse", ...issue.path]
                    });
                return z.NEVER;
            }
            const predicates = parsed.data.prerequisites;
            if (
                (predicates?.some?.length ?? 0) +
                    (predicates?.none?.length ?? 0) >
                20
            ) {
                context.addIssue({
                    code: "custom",
                    message: "No máximo 20 predicados de pré-requisitos."
                });
                return z.NEVER;
            }
            flatten(parsed.data, ["latestCatalogCourse"], result);
        }
        if (
            result.length > 20 ||
            result.reduce((sum, item) => sum + item.values.length, 0) > 100
        ) {
            context.addIssue({
                code: "custom",
                message: "No máximo 20 condições e 100 valores de filtro."
            });
            return z.NEVER;
        }
        return result;
    })
    .openapi({
        type: "object",
        example: { credits: { gte: 4 }, unit: { code: "IC" } },
        description:
            "Filtros de disciplinas. Predicados some/none agrupam condições do mesmo item; todos os filtros são combinados com E.",
        param: {
            "explode": true,
            "style": "deepObject",
            schema,
            "x-pomi-filters": {
                ...resourceFilterOpenApiMetadata(legacyCourseFilterDefinitions),
                fields: [
                    ...resourceFilterOpenApiMetadata(
                        legacyCourseFilterDefinitions
                    ).fields,
                    ...catalogMetadata()
                ],
                collections: {
                    path: ["latestCatalogCourse", "prerequisites"],
                    quantifiers: ["some", "none"],
                    indexed: true,
                    sameItem: true,
                    combination: "and"
                },
                constraints: {
                    maxExpressions: 20,
                    maxDepth: 8,
                    maxParameters: 100,
                    maxPredicates: 20
                }
            }
        }
    });
