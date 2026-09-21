import { policies, StudentCapabilities } from "#/Authorization.js";
import { type IO, OutputBuilder } from "#/Contract.js";
import { InvalidStudentHistoryImportProblem } from "#/modules/planning/student-history-import/StudentHistoryImport.problems.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
    pathParam,
    pathSeg,
    ResourceNotFoundProblemSchema,
    SpecBuilder,
    YearPeriodSchema
} from "@pomi/api-core";
import z from "zod";

extendZodWithOpenApi(z);

const historyCourseStatusSchema = z
    .enum([
        "ENROLLED",
        "APPROVED",
        "APPROVED_BY_ATTENDANCE",
        "APPROVED_BY_PROFICIENCY",
        "DROPPED",
        "FAILED_BY_ATTENDANCE",
        "SUFFICIENT"
    ])
    .openapi("HistoryCourseStatus", {
        "x-pomi-schema": {
            kind: "value-object",
            publicName: "HistoryCourseStatus"
        }
    });

const specsBuilder = new SpecBuilder(
    [
        pathSeg.literal("student"),
        pathSeg.param("sid"),
        pathSeg.literal("course-history")
    ],
    ["student-course-history"],
    "import",
    {
        resource: "studentHistory",
        operationName: "StudentHistory",
        pathParameters: { sid: "studentId" }
    }
);

const course = z.object({
    code: z.string().min(1),
    name: z.string().min(1),
    grade: z.number().min(0).max(10).nullable(),
    workloadHours: z.number().int().nonnegative().nullable(),
    credits: z.number().int().nonnegative().nullable(),
    status: historyCourseStatusSchema
});

const semester = z.object({
    year: z.number().int().min(1900).max(9999),
    yearPeriod: YearPeriodSchema,
    courses: z.array(course)
});

const body = z
    .object({
        format: z.literal("pomi-student-history"),
        version: z.literal(1),
        student: z.object({ ra: z.string().regex(/^\d{6}$/) }),
        semesters: z.array(semester).min(1)
    })
    .strict()
    .openapi("StudentHistoryImportBody", {
        "x-pomi-schema": {
            kind: "input",
            publicName: "StudentHistoryImportBody"
        }
    });

const warning = z
    .object({
        year: z.number().int().nullable(),
        yearPeriod: z.string().nullable(),
        code: z.string().nullable(),
        message: z.string()
    })
    .strict();

const summary = z
    .object({
        created: z.number().int().nonnegative(),
        updated: z.number().int().nonnegative(),
        skipped: z.number().int().nonnegative(),
        warnings: z.array(warning)
    })
    .strict()
    .openapi("StudentHistoryImportSummary", {
        "x-pomi-schema": {
            kind: "projection",
            publicName: "StudentHistoryImportSummary"
        }
    });

const importHistory = {
    meta: {
        ...specsBuilder.create(),
        authorization: policies.studentAccess(
            "sid",
            StudentCapabilities.HISTORY_WRITE
        )
    },
    request: z.object({
        path: z.object({
            sid: pathParam.integer()
        }),
        body
    }),
    response: new OutputBuilder()
        .ok(summary, "Student history imported successfully")
        .problem(404, ResourceNotFoundProblemSchema, "Aluno não encontrado")
        .problem(
            422,
            InvalidStudentHistoryImportProblem.schema,
            "Histórico escolar inválido"
        )
        .build()
} satisfies IO;

export default { importHistory, body, summary };
