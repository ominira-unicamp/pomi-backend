import { policies, StudentCapabilities } from "#/Authorization.js";
import { OutputBuilder, type IO } from "#/Contract.js";
import { InvalidStudentCourseAttemptProblem } from "#/modules/planning/student-course-attempt/StudentCourseAttempt.problems.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
    createPaginationQuerySchema,
    filterDefinition,
    getPaginatedSchema,
    pathParam,
    pathSeg,
    ReferenceNotFoundProblemSchema,
    resourceFilterSchema,
    ResourceNotFoundProblemSchema,
    SpecBuilder,
    UniqueConstraintConflictProblemSchema,
    unpaginatedByDefault,
    YearPeriodSchema,
    type Filter
} from "@pomi/api-core";
import z from "zod";

extendZodWithOpenApi(z);

const basePath = [
    pathSeg.literal("student"),
    pathSeg.param("sid"),
    pathSeg.literal("course-attempts")
];
const tags = ["student-course-attempts"];
const specsBuilder = new SpecBuilder(basePath, tags, "id", {
    resource: "courseAttempts",
    operationName: "StudentCourseAttempts",
    pathParameters: { id: "courseAttemptId" }
});

export const StudentCourseAttemptStatus = {
    ENROLLED: "ENROLLED",
    DROPPED: "DROPPED",
    APPROVED: "APPROVED",
    FAILED_BY_GRADE: "FAILED_BY_GRADE",
    APPROVED_BY_ATTENDANCE: "APPROVED_BY_ATTENDANCE",
    APPROVED_BY_PROFICIENCY: "APPROVED_BY_PROFICIENCY",
    FAILED_BY_ATTENDANCE: "FAILED_BY_ATTENDANCE",
    SUFFICIENT: "SUFFICIENT",
    INSUFFICIENT: "INSUFFICIENT"
} as const;

export const statusSchema = z
    .enum([
        "ENROLLED",
        "DROPPED",
        "APPROVED",
        "FAILED_BY_GRADE",
        "APPROVED_BY_ATTENDANCE",
        "APPROVED_BY_PROFICIENCY",
        "FAILED_BY_ATTENDANCE",
        "SUFFICIENT",
        "INSUFFICIENT"
    ])
    .openapi("StudentCourseAttemptStatus", {
        "x-pomi-schema": {
            kind: "value-object",
            publicName: "StudentCourseAttemptStatus"
        }
    });
const evaluationModeSchema = z
    .enum(["GRADE_AND_ATTENDANCE", "ATTENDANCE", "CONCEPT"])
    .openapi("CourseEvaluationMode", {
        "x-pomi-schema": {
            kind: "value-object",
            publicName: "CourseEvaluationMode"
        }
    });
const gradeSchema = z.number().min(0).max(10).nullable();

const courseAttemptCourseSchema = z
    .object({
        id: z.number().int(),
        code: z.string(),
        name: z.string(),
        credits: z.number().int(),
        unit: z.object({ id: z.number().int(), code: z.string() }).nullable()
    })
    .openapi("CourseAttemptCourse", {
        "x-pomi-schema": {
            kind: "projection",
            publicName: "CourseAttemptCourse"
        }
    });
const courseAttemptStudyPeriodSchema = z
    .object({
        id: z.number().int(),
        year: z.number().int(),
        yearPeriod: YearPeriodSchema
    })
    .openapi("CourseAttemptStudyPeriod", {
        "x-pomi-schema": {
            kind: "projection",
            publicName: "CourseAttemptStudyPeriod"
        }
    });
const courseAttemptClassSchema = z
    .object({
        id: z.number().int(),
        code: z.string(),
        professors: z.array(
            z.object({ id: z.number().int(), name: z.string() })
        )
    })
    .openapi("CourseAttemptClass", {
        "x-pomi-schema": {
            kind: "projection",
            publicName: "CourseAttemptClass"
        }
    });

const attemptEntity = z
    .object({
        id: z.number().int(),
        studentId: z.number().int(),
        courseId: z.number().int(),
        studyPeriodId: z.number().int().nullable(),
        classId: z.number().int().nullable(),
        evaluationMode: evaluationModeSchema,
        status: statusSchema,
        grade: z.number().nullable(),
        createdAt: z.string().datetime(),
        updatedAt: z.string().datetime(),
        course: courseAttemptCourseSchema,
        studyPeriod: courseAttemptStudyPeriodSchema.nullable(),
        class: courseAttemptClassSchema.nullable(),
        _paths: z.object({
            self: z.string(),
            student: z.string(),
            course: z.string(),
            studyPeriod: z.string().nullable(),
            class: z.string().nullable()
        })
    })
    .strict()
    .openapi("StudentCourseAttempt", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "StudentCourseAttempt",
            identityFields: ["id"],
            transportFields: ["_paths"],
            relations: {
                course: { resource: "courses", cardinality: "one" },
                studyPeriod: {
                    resource: "studyPeriods",
                    cardinality: "one",
                    nullable: true
                },
                class: {
                    resource: "classes",
                    cardinality: "one",
                    nullable: true
                }
            }
        }
    });

const attemptBody = z
    .object({
        courseId: z.number().int(),
        studyPeriodId: z.number().int().nullable().optional(),
        classId: z.number().int().nullable().optional(),
        evaluationMode: evaluationModeSchema.optional(),
        status: statusSchema,
        grade: gradeSchema.optional()
    })
    .strict()
    .openapi("CreateStudentCourseAttemptInput", {
        "x-pomi-schema": {
            kind: "input",
            publicName: "CreateStudentCourseAttemptInput"
        }
    });

const attemptFilter = resourceFilterSchema(
    {
        status: filterDefinition.enum([
            "ENROLLED",
            "DROPPED",
            "APPROVED",
            "FAILED_BY_GRADE",
            "APPROVED_BY_ATTENDANCE",
            "APPROVED_BY_PROFICIENCY",
            "FAILED_BY_ATTENDANCE",
            "SUFFICIENT",
            "INSUFFICIENT"
        ]),
        courseId: filterDefinition.id(),
        studyPeriodId: filterDefinition.id()
    },
    "student course attempts",
    "Structured course attempt filters. Use filter[status]=APPROVED or filter[courseId]=42.",
    { status: "APPROVED" }
);
export type StudentCourseAttemptFilter = Filter;

const get = {
    meta: {
        ...specsBuilder.get(),
        operationId: "getStudentCourseAttempts",
        sdk: {
            resource: "courseAttempts",
            action: "get" as const,
            method: "get",
            pathParameters: { sid: "studentId", id: "courseAttemptId" }
        },
        authorization: policies.studentAccess(
            "sid",
            StudentCapabilities.HISTORY_READ
        )
    },
    request: z.object({
        path: z.object({
            sid: pathParam.integer(),
            id: pathParam.integer()
        })
    }),
    response: new OutputBuilder()
        .ok(attemptEntity, "Student course attempt retrieved successfully")
        .problem(
            404,
            ResourceNotFoundProblemSchema,
            "Tentativa de disciplina não encontrada"
        )
        .build()
} satisfies IO;

const list = {
    meta: {
        ...specsBuilder.list(),
        operationId: "listStudentCourseAttempts",
        sdk: {
            resource: "courseAttempts",
            action: "list" as const,
            method: "list",
            pathParameters: { sid: "studentId" }
        },
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
            filter: attemptFilter.optional()
        })
            .strict()
            .openapi("ListStudentCourseAttemptsQuery", {
                "x-pomi-schema": {
                    kind: "input",
                    publicName: "ListStudentCourseAttemptsQuery"
                }
            })
    }),
    response: new OutputBuilder()
        .ok(
            getPaginatedSchema(attemptEntity),
            "Student course attempts retrieved successfully"
        )
        .build()
} satisfies IO;

const create = {
    meta: {
        ...specsBuilder.create(),
        operationId: "createStudentCourseAttempts",
        sdk: {
            resource: "courseAttempts",
            action: "create" as const,
            method: "create",
            pathParameters: { sid: "studentId" }
        },
        authorization: policies.studentAccess(
            "sid",
            StudentCapabilities.HISTORY_WRITE
        )
    },
    request: z.object({
        path: z.object({
            sid: pathParam.integer()
        }),
        body: attemptBody
    }),
    response: new OutputBuilder()
        .created(attemptEntity, "Student course attempt created successfully")
        .problem(
            409,
            UniqueConstraintConflictProblemSchema,
            "Tentativa cursando já existente"
        )
        .problem(
            422,
            z.discriminatedUnion("type", [
                ReferenceNotFoundProblemSchema,
                InvalidStudentCourseAttemptProblem.schema
            ]),
            "Tentativa de disciplina inválida"
        )
        .build()
} satisfies IO;

const patch = {
    meta: {
        ...specsBuilder.patch(),
        operationId: "updateStudentCourseAttempts",
        sdk: {
            resource: "courseAttempts",
            action: "update" as const,
            method: "update",
            pathParameters: { sid: "studentId", id: "courseAttemptId" }
        },
        authorization: policies.studentAccess(
            "sid",
            StudentCapabilities.HISTORY_WRITE
        )
    },
    request: z.object({
        path: z.object({
            sid: pathParam.integer(),
            id: pathParam.integer()
        }),
        body: attemptBody
            .omit({ courseId: true })
            .partial()
            .strict()
            .openapi("UpdateStudentCourseAttemptInput", {
                "x-pomi-schema": {
                    kind: "input",
                    publicName: "UpdateStudentCourseAttemptInput"
                }
            })
    }),
    response: new OutputBuilder()
        .ok(attemptEntity, "Student course attempt updated successfully")
        .problem(
            404,
            ResourceNotFoundProblemSchema,
            "Tentativa de disciplina não encontrada"
        )
        .problem(
            409,
            UniqueConstraintConflictProblemSchema,
            "Tentativa cursando já existente"
        )
        .problem(
            422,
            z.discriminatedUnion("type", [
                ReferenceNotFoundProblemSchema,
                InvalidStudentCourseAttemptProblem.schema
            ]),
            "Tentativa de disciplina inválida"
        )
        .build()
} satisfies IO;

const remove = {
    meta: {
        ...specsBuilder.remove(),
        operationId: "deleteStudentCourseAttempts",
        sdk: {
            resource: "courseAttempts",
            action: "delete" as const,
            method: "delete",
            pathParameters: { sid: "studentId", id: "courseAttemptId" }
        },
        authorization: policies.studentAccess(
            "sid",
            StudentCapabilities.HISTORY_WRITE
        )
    },
    request: z.object({
        path: z.object({
            sid: pathParam.integer(),
            id: pathParam.integer()
        })
    }),
    response: new OutputBuilder()
        .noContent()
        .problem(
            404,
            ResourceNotFoundProblemSchema,
            "Tentativa de disciplina não encontrada"
        )
        .build()
} satisfies IO;

export default {
    schema: attemptEntity,
    statusSchema,
    get,
    list,
    create,
    patch,
    remove
};
