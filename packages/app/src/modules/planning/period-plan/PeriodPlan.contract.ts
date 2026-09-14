import { policies, StudentCapabilities } from "#/Authorization.js";
import { type IO, OutputBuilder } from "#/Contract.js";
import { InvalidPeriodPlanProblem } from "#/modules/planning/period-plan/PeriodPlan.problems.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
    createPaginationQuerySchema,
    DayOfWeekSchema,
    getPaginatedSchema,
    pathParam,
    pathSeg,
    ReferenceNotFoundProblemSchema,
    ResourceNotFoundProblemSchema,
    SpecBuilder,
    unpaginatedByDefault,
    YearPeriodSchema
} from "@pomi/api-core";
import z from "zod";

extendZodWithOpenApi(z);

const planningGuideModeSchema = z
    .enum(["CURRICULUM", "PROGRAM", "NONE"])
    .openapi("PlanningGuideMode", {
        "x-pomi-schema": {
            kind: "value-object",
            publicName: "PlanningGuideMode"
        }
    });
const planningCurriculumSourceSchema = z
    .enum(["SAVED", "SUGGESTION"])
    .openapi("PlanningCurriculumSource", {
        "x-pomi-schema": {
            kind: "value-object",
            publicName: "PlanningCurriculumSource"
        }
    });
const planningVisibilitySchema = z
    .enum(["PRIVATE", "FRIENDS", "PUBLIC"])
    .openapi("PlanningVisibility", {
        "x-pomi-schema": {
            kind: "value-object",
            publicName: "PlanningVisibility"
        }
    });

const basePath = [
    pathSeg.literal("student"),
    pathSeg.param("sid"),
    pathSeg.literal("period-plannings")
];
const tags = ["period-plannings"];
const specsBuilder = new SpecBuilder(basePath, tags, "id", {
    resource: "periodPlannings",
    operationName: "StudentPeriodPlannings",
    pathParameters: { id: "periodPlanningId" }
});

export const guideSchema = z
    .object({
        mode: planningGuideModeSchema,
        curriculumSource: planningCurriculumSourceSchema.nullable(),
        curriculumId: z.number().int().nullable(),
        suggestionId: z.number().int().nullable(),
        suggestionCatalogProgramId: z.number().int().nullable().optional(),
        catalogProgramId: z.number().int().nullable(),
        specializationId: z.number().int().nullable(),
        languageId: z.number().int().nullable(),
        manualCourseIds: z
            .array(z.number().int())
            .transform((arr) => [...new Set(arr)])
    })
    .strict()
    .openapi("PlanningGuide", {
        "x-pomi-schema": { kind: "value-object", publicName: "PlanningGuide" }
    });

const periodPlanningProfessorSchema = z
    .object({
        id: z.number().int(),
        name: z.string()
    })
    .strict()
    .openapi("PeriodPlanningProfessor", {
        "x-pomi-schema": {
            kind: "projection",
            publicName: "PeriodPlanningProfessor"
        }
    });

const periodPlanningScheduleSchema = z
    .object({
        id: z.number().int(),
        dayOfWeek: DayOfWeekSchema,
        start: z.string(),
        end: z.string(),
        roomId: z.number().int(),
        roomCode: z.string()
    })
    .strict()
    .openapi("PeriodPlanningSchedule", {
        "x-pomi-schema": {
            kind: "projection",
            publicName: "PeriodPlanningSchedule"
        }
    });

export const periodPlanningClass = z
    .object({
        id: z.number().int(),
        code: z.string(),
        reservations: z.array(z.number().int()),
        courseId: z.number().int(),
        courseCode: z.string(),
        courseCredits: z.number(),
        professors: z.array(periodPlanningProfessorSchema),
        classSchedules: z.array(periodPlanningScheduleSchema)
    })
    .strict()
    .openapi("PeriodPlanningClass", {
        "x-pomi-schema": {
            kind: "projection",
            publicName: "PeriodPlanningClass"
        }
    });

const periodPlanningEntity = z
    .object({
        id: z.number().int(),
        studentId: z.number().int(),
        name: z.string(),
        studyPeriodId: z.number().int(),
        studyPeriodYear: z.number().int(),
        studyPeriodYearPeriod: YearPeriodSchema,
        curriculumId: z.number().int().nullable(),
        visibility: planningVisibilitySchema,
        shareId: z.string().uuid(),
        guide: guideSchema,
        createdAt: z.string().datetime(),
        updatedAt: z.string().datetime(),
        classes: z.array(periodPlanningClass),
        _paths: z
            .object({
                self: z.string(),
                student: z.string(),
                studyPeriod: z.string(),
                curriculum: z.string().nullable()
            })
            .strict()
    })
    .strict()
    .openapi("PeriodPlanningEntity", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "PeriodPlanning",
            identityFields: ["id"],
            transportFields: ["_paths"],
            relations: {
                studentId: { resource: "students", cardinality: "one" },
                studyPeriodId: {
                    resource: "studyPeriods",
                    cardinality: "one"
                },
                curriculumId: {
                    resource: "curricula",
                    cardinality: "one",
                    nullable: true
                },
                classes: { resource: "classes", cardinality: "many" }
            }
        }
    });

const get = {
    meta: {
        ...specsBuilder.get(),
        operationId: "getStudentPeriodPlannings",
        sdk: {
            resource: "periodPlannings",
            action: "get" as const,
            method: "get",
            pathParameters: { sid: "studentId", id: "periodPlanningId" }
        },
        authorization: policies.studentAccess(
            "sid",
            StudentCapabilities.PLANNING_READ
        )
    },
    request: z.object({
        path: z.object({
            sid: pathParam.integer(),
            id: pathParam.integer()
        })
    }),
    response: new OutputBuilder()
        .ok(periodPlanningEntity, "Period planning retrieved successfully")
        .notFound()
        .build()
} satisfies IO;

const list = {
    meta: {
        ...specsBuilder.list(),
        operationId: "listStudentPeriodPlannings",
        sdk: {
            resource: "periodPlannings",
            action: "list" as const,
            method: "list",
            pathParameters: { sid: "studentId" }
        },
        authorization: policies.studentAccess(
            "sid",
            StudentCapabilities.PLANNING_READ
        ),
        pagination: unpaginatedByDefault
    },
    request: z.object({
        path: z.object({
            sid: pathParam.integer()
        }),
        query: createPaginationQuerySchema(unpaginatedByDefault)
    }),
    response: new OutputBuilder()
        .ok(
            getPaginatedSchema(periodPlanningEntity),
            "List of period plannings retrieved successfully"
        )
        .build()
} satisfies IO;

export const createBody = z
    .object({
        name: z.string().trim().min(1).optional(),
        studyPeriodId: z.number().int(),
        curriculumId: z.number().int().nullable().optional(),
        guide: guideSchema.optional(),
        classes: z.array(z.number().int()).transform((arr) => new Set(arr))
    })
    .strict()
    .openapi("CreatePeriodPlanningInput", {
        "x-pomi-schema": {
            kind: "input",
            publicName: "CreatePeriodPlanningInput"
        }
    });

const create = {
    meta: {
        ...specsBuilder.create(),
        operationId: "createStudentPeriodPlannings",
        sdk: {
            resource: "periodPlannings",
            action: "create" as const,
            method: "create",
            pathParameters: { sid: "studentId" }
        },
        authorization: policies.studentAccess(
            "sid",
            StudentCapabilities.PLANNING_WRITE
        )
    },
    request: z.object({
        path: z.object({
            sid: pathParam.integer()
        }),
        body: createBody
    }),
    response: new OutputBuilder()
        .created(periodPlanningEntity, "Period planning created successfully")
        .problem(
            422,
            z.discriminatedUnion("type", [
                ReferenceNotFoundProblemSchema,
                InvalidPeriodPlanProblem.schema
            ]),
            "Planejamento de semestre inválido"
        )
        .build()
} satisfies IO;

export const patchBody = z
    .object({
        name: z.string().trim().min(1).optional(),
        visibility: planningVisibilitySchema.optional(),
        curriculumId: z.number().int().nullable().optional(),
        guide: guideSchema.optional(),
        classes: z
            .object({
                set: z.array(z.number().int()).transform((arr) => new Set(arr)),
                add: z.array(z.number().int()).transform((arr) => new Set(arr)),
                remove: z
                    .array(z.number().int())
                    .transform((arr) => new Set(arr))
            })
            .partial()
            .optional()
    })
    .strict()
    .openapi("UpdatePeriodPlanningInput", {
        "x-pomi-schema": {
            kind: "input",
            publicName: "UpdatePeriodPlanningInput"
        }
    });

const patch = {
    meta: {
        ...specsBuilder.patch(),
        operationId: "updateStudentPeriodPlannings",
        sdk: {
            resource: "periodPlannings",
            action: "update" as const,
            method: "update",
            pathParameters: { sid: "studentId", id: "periodPlanningId" }
        },
        authorization: policies.studentAccess(
            "sid",
            StudentCapabilities.PLANNING_WRITE
        )
    },
    request: z.object({
        path: z.object({
            sid: pathParam.integer(),
            id: pathParam.integer()
        }),
        body: patchBody
    }),
    response: new OutputBuilder()
        .ok(periodPlanningEntity, "Period planning updated successfully")
        .problem(
            404,
            ResourceNotFoundProblemSchema,
            "Planejamento de semestre não encontrado"
        )
        .problem(
            422,
            z.discriminatedUnion("type", [
                ReferenceNotFoundProblemSchema,
                InvalidPeriodPlanProblem.schema
            ]),
            "Planejamento de semestre inválido"
        )
        .build()
} satisfies IO;

const remove = {
    meta: {
        ...specsBuilder.remove(),
        operationId: "deleteStudentPeriodPlannings",
        sdk: {
            resource: "periodPlannings",
            action: "delete" as const,
            method: "delete",
            pathParameters: { sid: "studentId", id: "periodPlanningId" }
        },
        authorization: policies.studentAccess(
            "sid",
            StudentCapabilities.PLANNING_WRITE
        )
    },
    request: z.object({
        path: z.object({
            sid: pathParam.integer(),
            id: pathParam.integer()
        })
    }),
    response: new OutputBuilder()
        .noContent("Period planning deleted successfully")
        .notFound()
        .build()
} satisfies IO;

function alias<Contract extends IO>(
    contract: Contract,
    operationId: string
): Contract {
    return {
        ...contract,
        meta: {
            ...contract.meta,
            operationId,
            deprecated: true,
            sdk: false,
            path: contract.meta.path.map((segment) =>
                segment.type === "literal" &&
                segment.value === "period-plannings"
                    ? pathSeg.literal("period-plan")
                    : segment
            )
        }
    };
}

export default {
    schema: periodPlanningEntity,
    get,
    list,
    create,
    patch,
    remove,
    aliases: {
        get: alias(get, "getStudentPeriodPlan"),
        list: alias(list, "listStudentPeriodPlan"),
        create: alias(create, "createStudentPeriodPlan"),
        patch: alias(patch, "updateStudentPeriodPlan"),
        remove: alias(remove, "deleteStudentPeriodPlan")
    }
};
