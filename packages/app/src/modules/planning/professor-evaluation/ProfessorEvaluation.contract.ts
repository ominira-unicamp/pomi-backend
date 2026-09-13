import { policies, StudentCapabilities } from "#/Authorization.js";
import { OutputBuilder, type IO } from "#/Contract.js";
import { InvalidProfessorEvaluationProblem } from "#/modules/planning/professor-evaluation/ProfessorEvaluation.problems.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
    createPaginationQuerySchema,
    filterDefinition,
    getPaginatedSchema,
    pathParam,
    pathSeg,
    ReferenceNotFoundProblemSchema,
    resourceFilterSchema,
    unpaginatedByDefault,
    type Filter
} from "@pomi/api-core";
import z from "zod";

extendZodWithOpenApi(z);

const basePath = [
    pathSeg.literal("student"),
    pathSeg.param("sid"),
    pathSeg.literal("classes"),
    pathSeg.param("classId"),
    pathSeg.literal("professors"),
    pathSeg.param("professorId"),
    pathSeg.literal("evaluation")
];

const pendingPath = [
    pathSeg.literal("student"),
    pathSeg.param("sid"),
    pathSeg.literal("professor-evaluations"),
    pathSeg.literal("pending")
];

const path = z.object({
    sid: pathParam.integer(),
    classId: pathParam.integer(),
    professorId: pathParam.integer()
});

const score = z.number().int().min(1).max(5);

const evaluationBody = z
    .object({
        wouldTakeAgain: score,
        fairness: score,
        clarity: score,
        difficulty: score
    })
    .strict()
    .openapi("ProfessorEvaluationBody");

const evaluation = evaluationBody
    .extend({
        id: z.number().int(),
        studentId: z.number().int(),
        classId: z.number().int(),
        professorId: z.number().int(),
        createdAt: z.string().datetime(),
        updatedAt: z.string().datetime()
    })
    .strict()
    .openapi("ProfessorEvaluation");

const eligibility = z
    .object({
        eligible: z.boolean(),
        evaluation: evaluation.nullable()
    })
    .strict()
    .openapi("ProfessorEvaluationEligibility");

const pendingEvaluation = z
    .object({
        attemptId: z.number().int(),
        class: z.object({ id: z.number().int(), code: z.string() }),
        course: z.object({
            id: z.number().int(),
            code: z.string(),
            name: z.string()
        }),
        professor: z.object({ id: z.number().int(), name: z.string() })
    })
    .strict()
    .openapi("PendingProfessorEvaluation");

const invalidEvaluationResponse = z.discriminatedUnion("type", [
    ReferenceNotFoundProblemSchema,
    InvalidProfessorEvaluationProblem.schema
]);

const pendingFilter = resourceFilterSchema(
    {
        year: filterDefinition.integer({ operators: ["eq"] }),
        yearPeriod: filterDefinition.enum(
            ["FIRST_SEMESTER", "SECOND_SEMESTER"],
            ["eq"]
        )
    },
    "pending professor evaluations",
    "Pending evaluation filters. Use filter[year]=2026&filter[yearPeriod]=FIRST_SEMESTER.",
    { year: 2026, yearPeriod: "FIRST_SEMESTER" }
).superRefine((filter: Filter, context) => {
    const paths = new Set(
        filter.map((expression) => expression.path.join("."))
    );
    if (!paths.has("year"))
        context.addIssue({
            code: "custom",
            path: ["year"],
            message: "O filtro deve informar o ano do período letivo."
        });
    if (!paths.has("yearPeriod"))
        context.addIssue({
            code: "custom",
            path: ["yearPeriod"],
            message: "O filtro deve informar o semestre do período letivo."
        });
    if (filter.length !== 2)
        context.addIssue({
            code: "custom",
            path: [],
            message: "O filtro deve informar apenas year e yearPeriod."
        });
});

const get = {
    meta: {
        method: "get" as const,
        path: basePath,
        tags: ["professor-evaluations"],
        authorization: policies.studentAccess(
            "sid",
            StudentCapabilities.HISTORY_READ
        )
    },
    request: z.object({ path }),
    response: new OutputBuilder()
        .ok(eligibility, "Elegibilidade de avaliação recuperada")
        .problem(422, invalidEvaluationResponse, "Avaliação inválida")
        .build()
} satisfies IO;

const put = {
    meta: {
        method: "put" as const,
        path: basePath,
        tags: ["professor-evaluations"],
        authorization: policies.studentAccess(
            "sid",
            StudentCapabilities.HISTORY_WRITE
        )
    },
    request: z.object({ path, body: evaluationBody }),
    response: new OutputBuilder()
        .ok(evaluation, "Avaliação atualizada")
        .problem(422, invalidEvaluationResponse, "Avaliação inválida")
        .build()
} satisfies IO;

const listPending = {
    meta: {
        method: "get" as const,
        path: pendingPath,
        tags: ["professor-evaluations"],
        authorization: policies.studentAccess(
            "sid",
            StudentCapabilities.HISTORY_READ
        ),
        queryFeatures: { filter: true },
        pagination: unpaginatedByDefault
    },
    request: z.object({
        path: z.object({
            sid: pathParam.integer()
        }),
        query: createPaginationQuerySchema(unpaginatedByDefault, {
            filter: pendingFilter
        })
            .strict()
            .openapi("ListPendingProfessorEvaluationsQuery")
    }),
    response: new OutputBuilder()
        .ok(
            getPaginatedSchema(pendingEvaluation),
            "Avaliações pendentes recuperadas"
        )
        .build()
} satisfies IO;

export default { schema: evaluation, get, put, listPending };
