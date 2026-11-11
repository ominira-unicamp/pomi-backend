import { policies, UserCapabilities } from "#/Authorization.js";
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
    pathSeg.literal("users"),
    pathSeg.param("userId"),
    pathSeg.literal("course-attempts"),
    pathSeg.param("attemptId"),
    pathSeg.literal("absences")
];
const userAbsencesPath = [
    pathSeg.literal("users"),
    pathSeg.param("userId"),
    pathSeg.literal("absences")
];
const specsBuilder = new SpecBuilder(basePath, ["student-absences"], "id", {
    resource: "studentAbsences",
    operationName: "StudentAbsences",
    pathParameters: {
        userId: "userId",
        attemptId: "courseAttemptId",
        id: "studentAbsenceId"
    }
});
const userAbsencesSpecsBuilder = new SpecBuilder(
    userAbsencesPath,
    ["student-absences"],
    "id",
    {
        resource: "studentAbsences",
        operationName: "UserAbsences",
        pathParameters: { userId: "userId" }
    }
);

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
        end: z.string()
    })
    .strict()
    .openapi("StudentAbsence", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "StudentAbsence",
            identityFields: ["id"]
        }
    });

const absenceBody = z
    .object({
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

const userPath = z.object({
    userId: pathParam.integer()
});
const attemptPath = userPath.extend({
    attemptId: pathParam.positiveInteger()
});
const entityPath = attemptPath.extend({
    id: pathParam.integer()
});

const attemptFilter = resourceFilterSchema(
    { courseAttemptId: filterDefinition.id({ positive: true }) },
    "student absences",
    "Filtre pelo ID da tentativa usando eq ou in.",
    { courseAttemptId: 123 }
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
        ...userAbsencesSpecsBuilder.list(),
        authorization: policies.userAccess(
            "userId",
            UserCapabilities.HISTORY_READ
        ),
        queryFeatures: { filter: true, sort: true },
        pagination: unpaginatedByDefault
    },
    request: z.object({
        path: userPath,
        query: createPaginationQuerySchema(unpaginatedByDefault, {
            filter: attemptFilter.optional(),
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
        .problem(
            404,
            ResourceNotFoundProblemSchema,
            "Registro acadêmico não encontrado"
        )
        .build()
} satisfies IO;

const create = {
    meta: {
        ...specsBuilder.create(),
        authorization: policies.userAccess(
            "userId",
            UserCapabilities.HISTORY_WRITE
        )
    },
    request: z.object({ path: attemptPath, body: absenceBody }),
    response: new OutputBuilder()
        .created(absenceEntity, "Falta registrada com sucesso")
        .problem(
            404,
            ResourceNotFoundProblemSchema,
            "Registro acadêmico não encontrado"
        )
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
        authorization: policies.userAccess(
            "userId",
            UserCapabilities.HISTORY_WRITE
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
