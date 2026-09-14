import { OutputBuilder, type IO } from "#/BuildHandler.js";
import { policies } from "#/auth.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
    filterDefinition,
    getPaginatedSchema,
    paginatedByDefault,
    paginationQuerySchema,
    pathSeg,
    resourceFilterSchema,
    type Filter
} from "@pomi/api-core";
import z from "zod";

extendZodWithOpenApi(z);

const metrics = z
    .object({
        responseCount: z.number().int().min(5),
        wouldTakeAgain: z.number(),
        fairness: z.number(),
        clarity: z.number(),
        difficulty: z.number()
    })
    .strict();

const professor = z.object({ id: z.number().int(), name: z.string() }).strict();

const course = z
    .object({ id: z.number().int(), code: z.string(), name: z.string() })
    .strict();

const professorSummary = metrics
    .extend({ professor })
    .strict()
    .openapi("ProfessorEvaluationSummary", {
        "x-pomi-schema": {
            kind: "projection",
            publicName: "ProfessorEvaluationSummary"
        }
    });

const courseSummary = metrics
    .extend({ course })
    .strict()
    .openapi("CourseEvaluationSummary", {
        "x-pomi-schema": {
            kind: "projection",
            publicName: "CourseEvaluationSummary"
        }
    });

const pairSummary = metrics
    .extend({ course, professor })
    .strict()
    .openapi("CourseProfessorEvaluationSummary", {
        "x-pomi-schema": {
            kind: "projection",
            publicName: "CourseProfessorEvaluationSummary"
        }
    });

const pairFilter = resourceFilterSchema(
    {
        courseId: filterDefinition.id({ positive: true }),
        professorId: filterDefinition.id({ positive: true })
    },
    "evaluation summary pair",
    "Structured evaluation summary filters. Use filter[courseId]=1&filter[professorId]=2."
).superRefine((filter: Filter, context) => {
    const fields = new Set(filter.map((expression) => expression.path[0]));
    for (const field of ["courseId", "professorId"]) {
        if (!fields.has(field)) {
            context.addIssue({
                code: "custom",
                message: `${field} is required`
            });
        }
    }
});

const professorSummaryFilter = resourceFilterSchema(
    { professorId: filterDefinition.id({ positive: true }) },
    "professor evaluation summaries",
    "Structured professor summary filters. Use filter[professorId]=1."
);
const courseSummaryFilter = resourceFilterSchema(
    {
        courseId: filterDefinition.id({ positive: true }),
        courseCode: filterDefinition.code()
    },
    "course evaluation summaries",
    "Structured course summary filters. Use filter[courseCode]=MC102."
);

const professorSummaries = {
    meta: {
        operationId: "listProfessorEvaluationSummaries",
        sdk: {
            resource: "evaluationSummaries",
            method: "listByProfessor",
            action: "list" as const
        },
        method: "get" as const,
        path: [
            pathSeg.literal("professors"),
            pathSeg.literal("evaluation-summaries")
        ],
        tags: ["evaluation-summaries"],
        authorization: policies.public,
        queryFeatures: { filter: true },
        pagination: paginatedByDefault
    },
    request: z.object({
        query: paginationQuerySchema.extend({
            filter: professorSummaryFilter.optional()
        })
    }),
    response: new OutputBuilder()
        .ok(
            getPaginatedSchema(professorSummary).openapi(
                "PageProfessorEvaluationSummaries",
                {
                    "x-pomi-schema": {
                        kind: "page",
                        publicName: "PageProfessorEvaluationSummaries"
                    }
                }
            ),
            "Sumários de avaliações por professor"
        )
        .badRequest()
        .build()
} satisfies IO;

const courseSummaries = {
    meta: {
        operationId: "listCourseEvaluationSummaries",
        sdk: {
            resource: "evaluationSummaries",
            method: "listByCourse",
            action: "list" as const
        },
        method: "get" as const,
        path: [
            pathSeg.literal("courses"),
            pathSeg.literal("evaluation-summaries")
        ],
        tags: ["evaluation-summaries"],
        authorization: policies.public,
        queryFeatures: { filter: true },
        pagination: paginatedByDefault
    },
    request: z.object({
        query: paginationQuerySchema.extend({
            filter: courseSummaryFilter.optional()
        })
    }),
    response: new OutputBuilder()
        .ok(
            getPaginatedSchema(courseSummary).openapi(
                "PageCourseEvaluationSummaries",
                {
                    "x-pomi-schema": {
                        kind: "page",
                        publicName: "PageCourseEvaluationSummaries"
                    }
                }
            ),
            "Sumários de avaliações por disciplina"
        )
        .badRequest()
        .build()
} satisfies IO;

const pair = {
    meta: {
        operationId: "getCourseProfessorEvaluationSummary",
        sdk: {
            resource: "evaluationSummaries",
            method: "getByCourseAndProfessor",
            action: "get" as const
        },
        method: "get" as const,
        path: [pathSeg.literal("evaluation-summaries")],
        tags: ["evaluation-summaries"],
        authorization: policies.public,
        queryFeatures: { filter: true }
    },
    request: z.object({
        query: z.object({ filter: pairFilter }).strict()
    }),
    response: new OutputBuilder()
        .ok(pairSummary, "Sumário de avaliações por professor e disciplina")
        .notFound()
        .badRequest()
        .build()
} satisfies IO;

export default {
    professorSummary,
    courseSummary,
    pairSummary,
    professorSummaries,
    courseSummaries,
    pair
};
