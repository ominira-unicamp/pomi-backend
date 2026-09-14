import { policies, StudentCapabilities } from "#/Authorization.js";
import { type IO, OutputBuilder } from "#/Contract.js";
import {
    FeedbackRateLimitProblem,
    InvalidFeedbackReportProblem
} from "#/modules/feedback/feedback-report/FeedbackReport.problems.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
    createPaginationQuerySchema,
    getPaginatedSchema,
    pathParam,
    pathSeg,
    ReferenceNotFoundProblemSchema,
    ResourceNotFoundProblemSchema,
    unpaginatedByDefault
} from "@pomi/api-core";
import z from "zod";

extendZodWithOpenApi(z);

export const feedbackFeatureKeys = [
    "home",
    "curriculum-planner",
    "semester-planner",
    "course-situation",
    "agenda",
    "social",
    "academic-data"
] as const;

export const feedbackAcademicResourceTypes = [
    "COURSE",
    "CATALOG_COURSE",
    "CATALOG_PROGRAM",
    "CURRICULUM_SUGGESTION",
    "CLASS",
    "CLASS_SCHEDULE",
    "STUDY_PERIOD",
    "DAILY_MENU",
    "CALENDAR_EVENT"
] as const;

const feedbackFeatureKeySchema = z
    .enum(feedbackFeatureKeys)
    .openapi("FeedbackFeatureKey", {
        "x-pomi-schema": {
            kind: "value-object",
            publicName: "FeedbackFeatureKey"
        }
    });
const feedbackAcademicResourceTypeSchema = z
    .enum(feedbackAcademicResourceTypes)
    .openapi("FeedbackAcademicResourceType", {
        "x-pomi-schema": {
            kind: "value-object",
            publicName: "FeedbackAcademicResourceType"
        }
    });
const feedbackKindSchema = z
    .enum(["BUG", "SUGGESTION", "DATA_ISSUE"])
    .openapi("FeedbackKind", {
        "x-pomi-schema": { kind: "value-object", publicName: "FeedbackKind" }
    });
const feedbackStatusSchema = z
    .enum(["OPEN", "IN_PROGRESS", "CLOSED"])
    .openapi("FeedbackStatus", {
        "x-pomi-schema": { kind: "value-object", publicName: "FeedbackStatus" }
    });

const feedbackPath = [pathSeg.literal("feedback-reports")];
const studentFeedbackPath = [
    pathSeg.literal("student"),
    pathSeg.param("sid"),
    pathSeg.literal("feedback-reports")
];

const studentPath = z.object({
    sid: pathParam.integer()
});

const target = z
    .discriminatedUnion("type", [
        z.object({ type: z.literal("GENERAL") }).strict(),
        z
            .object({
                type: z.literal("FEATURE"),
                featureKey: feedbackFeatureKeySchema
            })
            .strict(),
        z
            .object({
                type: z.literal("ACADEMIC_RESOURCE"),
                academicResourceType: feedbackAcademicResourceTypeSchema,
                academicResourceId: z.number().int().positive()
            })
            .strict()
    ])
    .openapi("FeedbackReportTarget", {
        "x-pomi-schema": { kind: "entity", publicName: "FeedbackReportTarget" }
    });

const body = z
    .object({
        kind: feedbackKindSchema,
        target,
        title: z.string().trim().min(5).max(160),
        description: z.string().trim().min(20).max(5000),
        sourcePath: z
            .string()
            .max(300)
            .regex(/^\/(?:[^?#]*)$/)
            .optional()
    })
    .strict()
    .openapi("CreateFeedbackReportBody", {
        "x-pomi-schema": {
            kind: "input",
            publicName: "CreateFeedbackReportBody"
        }
    });

const accepted = z
    .object({ createdAt: z.string().datetime() })
    .strict()
    .openapi("FeedbackReportAccepted", {
        "x-pomi-schema": {
            kind: "projection",
            publicName: "FeedbackReportAccepted"
        }
    });

const status = feedbackStatusSchema;
const report = z
    .object({
        id: z.number().int(),
        kind: feedbackKindSchema,
        target,
        title: z.string(),
        description: z.string(),
        sourcePath: z.string().nullable(),
        status,
        adminMessage: z.string().nullable(),
        reporterStudentId: z.number().int().nullable(),
        createdAt: z.string().datetime(),
        updatedAt: z.string().datetime()
    })
    .strict()
    .openapi("FeedbackReport", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "FeedbackReport",
            identityFields: ["id"]
        }
    });

const idPath = z.object({
    id: pathParam.positiveInteger()
});
const adminPatchBody = z
    .object({
        status: status.optional(),
        adminMessage: z.string().trim().max(5000).nullable().optional()
    })
    .strict()
    .refine(
        (input) =>
            input.status !== undefined || input.adminMessage !== undefined,
        {
            message: "Informe o status ou a mensagem administrativa."
        }
    )
    .openapi("PatchFeedbackReportBody", {
        "x-pomi-schema": {
            kind: "input",
            publicName: "PatchFeedbackReportBody"
        }
    });

const listStudent = {
    meta: {
        operationId: "listStudentFeedbackReports",
        sdk: {
            resource: "feedbackReports",
            method: "listForStudent",
            action: "list" as const,
            pathParameters: { sid: "studentId" }
        },
        method: "get" as const,
        path: studentFeedbackPath,
        tags: ["feedback-reports"],
        authorization: policies.studentAccess(
            "sid",
            StudentCapabilities.FEEDBACK_READ
        ),
        pagination: unpaginatedByDefault
    },
    request: z.object({
        path: studentPath,
        query: createPaginationQuerySchema(unpaginatedByDefault)
    }),
    response: new OutputBuilder()
        .ok(getPaginatedSchema(report), "Solicitações recuperadas")
        .build()
} satisfies IO;

const listAdmin = {
    meta: {
        operationId: "listFeedbackReports",
        sdk: {
            resource: "feedbackReports",
            method: "list",
            action: "list" as const
        },
        method: "get" as const,
        path: [pathSeg.literal("admin"), pathSeg.literal("feedback-reports")],
        tags: ["feedback-reports"],
        authorization: policies.admin,
        pagination: unpaginatedByDefault
    },
    request: z.object({
        query: createPaginationQuerySchema(unpaginatedByDefault)
    }),
    response: new OutputBuilder()
        .ok(getPaginatedSchema(report), "Solicitações recuperadas")
        .build()
} satisfies IO;

const patchAdmin = {
    meta: {
        operationId: "updateFeedbackReport",
        sdk: {
            resource: "feedbackReports",
            method: "update",
            action: "update" as const,
            pathParameters: { id: "feedbackReportId" }
        },
        method: "patch" as const,
        path: [
            pathSeg.literal("admin"),
            pathSeg.literal("feedback-reports"),
            pathSeg.param("id")
        ],
        tags: ["feedback-reports"],
        authorization: policies.admin
    },
    request: z.object({ path: idPath, body: adminPatchBody }),
    response: new OutputBuilder()
        .ok(report, "Solicitação atualizada")
        .problem(
            404,
            ResourceNotFoundProblemSchema,
            "Solicitação não encontrada"
        )
        .build()
} satisfies IO;

const createAnonymous = {
    meta: {
        operationId: "createFeedbackReport",
        sdk: {
            resource: "feedbackReports",
            method: "create",
            action: "create" as const
        },
        method: "post" as const,
        path: feedbackPath,
        tags: ["feedback-reports"],
        authorization: policies.public
    },
    request: z.object({ body }),
    response: new OutputBuilder()
        .created(accepted, "Feedback recebido")
        .problem(
            422,
            z.discriminatedUnion("type", [
                ReferenceNotFoundProblemSchema,
                InvalidFeedbackReportProblem.schema
            ]),
            "Feedback inválido"
        )
        .problem(
            404,
            ResourceNotFoundProblemSchema,
            "Solicitação não encontrada"
        )
        .problem(429, FeedbackRateLimitProblem.schema, "Muitos envios")
        .build()
} satisfies IO;

const createForStudent = {
    meta: {
        operationId: "createStudentFeedbackReport",
        sdk: {
            resource: "feedbackReports",
            method: "createForStudent",
            action: "create" as const,
            pathParameters: { sid: "studentId" }
        },
        method: "post" as const,
        path: studentFeedbackPath,
        tags: ["feedback-reports"],
        authorization: policies.studentAccess(
            "sid",
            StudentCapabilities.FEEDBACK_WRITE
        )
    },
    request: z.object({ path: studentPath, body }),
    response: new OutputBuilder()
        .created(accepted, "Feedback recebido")
        .problem(
            422,
            z.discriminatedUnion("type", [
                ReferenceNotFoundProblemSchema,
                InvalidFeedbackReportProblem.schema
            ]),
            "Feedback inválido"
        )
        .problem(
            404,
            ResourceNotFoundProblemSchema,
            "Solicitação não encontrada"
        )
        .build()
} satisfies IO;

export default {
    body,
    createAnonymous,
    createForStudent,
    listStudent,
    listAdmin,
    patchAdmin,
    schemas: { report }
};
