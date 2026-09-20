import { policies, StudentCapabilities } from "#/Authorization.js";
import { OutputBuilder, type IO } from "#/Contract.js";
import { InvalidStudentAbsenceProblem } from "#/modules/planning/student-absence/StudentAbsence.problems.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
    createPaginationQuerySchema,
    DayOfWeekSchema,
    defineSort,
    filterDefinition,
    getPaginatedSchema,
    pathParam,
    pathSeg,
    ReferenceNotFoundProblemSchema,
    resourceFilterSchema,
    ResourceNotFoundProblemSchema,
    resourceSortSchema,
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
    pathSeg.literal("absences")
];
const specsBuilder = new SpecBuilder(basePath, ["student-absences"], "id", {
    resource: "studentAbsences",
    operationName: "StudentAbsences",
    pathParameters: { sid: "studentId", id: "studentAbsenceId" }
});

const dayOfWeekSchema = DayOfWeekSchema;

const absenceEntity = z
    .object({
        id: z.number().int(),
        studentCourseAttemptId: z.number().int(),
        classScheduleId: z.number().int(),
        date: z.string().date(),
        createdAt: z.string().datetime(),
        updatedAt: z.string().datetime(),
        studyPeriodId: z.number().int(),
        studyPeriodYear: z.number().int(),
        studyPeriodYearPeriod: YearPeriodSchema,
        courseId: z.number().int(),
        courseCode: z.string(),
        classId: z.number().int(),
        classCode: z.string(),
        dayOfWeek: dayOfWeekSchema,
        start: z.string(),
        end: z.string(),
        _paths: z
            .object({
                self: z.string(),
                courseAttempt: z.string(),
                classSchedule: z.string(),
                class: z.string(),
                course: z.string(),
                studyPeriod: z.string()
            })
            .strict()
    })
    .strict()
    .openapi("StudentAbsence", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "StudentAbsence",
            identityFields: ["id"],
            transportFields: ["_paths"]
        }
    });

const absenceBody = z
    .object({
        courseAttemptId: z.number().int(),
        classScheduleId: z.number().int(),
        date: z.string().date()
    })
    .strict()
    .openapi("CreateStudentAbsenceBody", {
        "x-pomi-schema": {
            kind: "input",
            publicName: "CreateStudentAbsenceBody"
        }
    });

const studentPath = z.object({
    sid: pathParam.integer()
});
const entityPath = studentPath.extend({
    id: pathParam.integer()
});

const absenceFilter = resourceFilterSchema(
    { courseAttemptId: filterDefinition.id() },
    "student absences",
    "Structured absence filters. Use filter[courseAttemptId]=42.",
    { courseAttemptId: 42 }
);
export type StudentAbsenceFilter = Filter;
export const studentAbsenceSort = defineSort({
    resourceName: "student absences",
    sortableFields: [
        "date",
        "courseCode",
        "classCode",
        "start",
        "createdAt"
    ] as const,
    defaultSort: [{ field: "date", direction: "desc" }] as const,
    tieBreakers: [{ field: "id", direction: "desc" }] as const
});

const list = {
    meta: {
        ...specsBuilder.list(),
        authorization: policies.studentAccess(
            "sid",
            StudentCapabilities.HISTORY_READ
        ),
        queryFeatures: { filter: true, sort: true },
        pagination: unpaginatedByDefault
    },
    request: z.object({
        path: studentPath,
        query: createPaginationQuerySchema(unpaginatedByDefault, {
            filter: absenceFilter.optional(),
            sort: resourceSortSchema(studentAbsenceSort).optional()
        })
            .strict()
            .openapi("ListStudentAbsencesQuery", {
                "x-pomi-schema": {
                    kind: "input",
                    publicName: "ListStudentAbsencesQuery"
                }
            })
    }),
    response: new OutputBuilder()
        .ok(getPaginatedSchema(absenceEntity), "Faltas recuperadas com sucesso")
        .build()
} satisfies IO;

const create = {
    meta: {
        ...specsBuilder.create(),
        authorization: policies.studentAccess(
            "sid",
            StudentCapabilities.HISTORY_WRITE
        )
    },
    request: z.object({ path: studentPath, body: absenceBody }),
    response: new OutputBuilder()
        .created(absenceEntity, "Falta registrada com sucesso")
        .problem(409, UniqueConstraintConflictProblemSchema, "Falta duplicada")
        .problem(
            422,
            z.discriminatedUnion("type", [
                ReferenceNotFoundProblemSchema,
                InvalidStudentAbsenceProblem.schema
            ]),
            "Falta inválida"
        )
        .build()
} satisfies IO;

const remove = {
    meta: {
        ...specsBuilder.remove(),
        authorization: policies.studentAccess(
            "sid",
            StudentCapabilities.HISTORY_WRITE
        )
    },
    request: z.object({ path: entityPath }),
    response: new OutputBuilder()
        .noContent()
        .problem(404, ResourceNotFoundProblemSchema, "Falta não encontrada")
        .build()
} satisfies IO;

export default {
    schema: absenceEntity,
    list,
    create,
    remove
};
