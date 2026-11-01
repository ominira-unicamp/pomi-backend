import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { YearPeriodSchema } from "@pomi/api-core";
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

const course = z.object({
    code: z.string().min(1),
    name: z.string().min(1),
    classCode: z.string().trim().min(1).nullable().optional(),
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

export const body = z
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

export const summary = z
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

export type ImportStudentHistoryInput = z.infer<typeof body>;
