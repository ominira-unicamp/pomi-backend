import IO, {
    createBody,
    guideInputSchema,
    patchBody,
    periodPlanningListQuery,
    periodPlanningSort
} from "#/modules/planning/period-plan/PeriodPlan.contract.js";
import periodPlanningPresenter from "#/modules/planning/period-plan/PeriodPlan.presenter.js";
import {
    periodPlanInputProblem,
    periodPlanNotFoundProblem,
    type PeriodPlanProblem
} from "#/modules/planning/period-plan/PeriodPlan.problems.js";
import { prismaPeriodPlanningFieldSelection } from "#/modules/planning/period-plan/PeriodPlan.queries.js";
import {
    compileSort,
    err,
    ok,
    prismaPaginationParams,
    resolvePagination,
    resolveSort,
    unpaginatedByDefault,
    type PageResult,
    type ProblemField,
    type Result
} from "@pomi/api-core";
import type { MyPrisma } from "@pomi/db";
import { studyPeriodCode, type PrismaClient } from "@pomi/db";
import z from "zod";
import { missingCourseIssues, planningIssues } from "../Planning.rules.js";
import {
    resolvePeriodPlanClasses,
    validatePeriodPlanClasses,
    validateProgramGuide,
    validateSavedGuide,
    validateSuggestionGuide
} from "./PeriodPlan.rules.js";

type PeriodPlan = z.infer<typeof IO.schema>;
type ListQuery = z.infer<typeof periodPlanningListQuery>;
type GuideInput = z.infer<typeof guideInputSchema>;
export type CreatePeriodPlanInput = z.infer<typeof createBody>;
export type PatchPeriodPlanInput = z.infer<typeof patchBody>;

export type PeriodPlanService = {
    list(userId: number, query: ListQuery): Promise<PageResult<PeriodPlan>>;
    getById(
        userId: number,
        id: number
    ): Promise<
        Result<PeriodPlan, ReturnType<typeof periodPlanNotFoundProblem>>
    >;
    create(
        userId: number,
        input: CreatePeriodPlanInput
    ): Promise<
        Result<
            PeriodPlan,
            Exclude<
                PeriodPlanProblem,
                ReturnType<typeof periodPlanNotFoundProblem>
            >
        >
    >;
    patch(
        userId: number,
        id: number,
        input: PatchPeriodPlanInput
    ): Promise<Result<PeriodPlan, PeriodPlanProblem>>;
    remove(
        userId: number,
        id: number
    ): Promise<Result<void, ReturnType<typeof periodPlanNotFoundProblem>>>;
};

async function guideFields(
    prisma: PrismaClient,
    guide: GuideInput,
    userId: number
): Promise<ProblemField[]> {
    const fields: ProblemField[] = [];
    if (guide.curriculum?.source === "SAVED") {
        const curriculumId = guide.curriculum.saved.curriculumId;
        const curriculum = await prisma.curriculum.findFirst({
            where: { id: curriculumId, userId },
            select: { id: true }
        });
        fields.push(...planningIssues(validateSavedGuide(!!curriculum)));
    }
    if (guide.curriculum?.source === "SUGGESTION") {
        const { suggestionId, catalogProgramId } = guide.curriculum.suggestion;
        const suggestion = await prisma.curriculumSuggestion.findUnique({
            where: { id: suggestionId },
            select: {
                id: true,
                catalogProgramVariant: {
                    select: { catalogProgramId: true }
                }
            }
        });
        fields.push(
            ...planningIssues(
                validateSuggestionGuide(
                    catalogProgramId,
                    suggestion?.catalogProgramVariant.catalogProgramId ?? null
                )
            )
        );
    }
    if (guide.program) {
        const { catalogProgramId, catalogProgramVariantId, languageId } =
            guide.program;
        const [program, variant, language] = await Promise.all([
            prisma.catalogProgram.findUnique({
                where: { id: catalogProgramId },
                select: { id: true }
            }),
            prisma.catalogProgramVariant.findFirst({
                where: {
                    id: catalogProgramVariantId,
                    catalogProgramId
                },
                select: { id: true }
            }),
            languageId === null
                ? Promise.resolve(null)
                : prisma.catalogLanguage.findFirst({
                      where: { languageId, catalogProgramId },
                      select: { languageId: true }
                  })
        ]);
        fields.push(
            ...planningIssues(
                validateProgramGuide({
                    program: !!program,
                    variant: !!variant,
                    language: languageId === null || !!language
                })
            )
        );
    }

    const courseIds = [...new Set(guide.manualCourseIds)];
    if (courseIds.length) {
        const courses = await prisma.course.findMany({
            where: { id: { in: courseIds } },
            select: { id: true }
        });
        const found = new Set(courses.map(({ id }) => id));
        fields.push(
            ...missingCourseIssues(courseIds, found, [
                "guide",
                "manualCourseIds"
            ])
        );
    }
    return fields;
}

async function classFields(
    prisma: PrismaClient,
    classIds: Set<number>,
    studyPeriodId: number,
    path: string[]
): Promise<ProblemField[]> {
    if (!classIds.size) return [];
    const classes = await prisma.class.findMany({
        where: { id: { in: [...classIds] } },
        select: { id: true, courseId: true, studyPeriodId: true }
    });
    return planningIssues(
        validatePeriodPlanClasses(classIds, classes, studyPeriodId, path)
    );
}

function classUpdateData(
    operations: NonNullable<PatchPeriodPlanInput["classes"]>
) {
    if (operations.set)
        return { set: [...operations.set].map((id) => ({ id })) };
    return {
        disconnect: operations.remove
            ? [...operations.remove].map((id) => ({ id }))
            : undefined,
        connect: operations.add
            ? [...operations.add].map((id) => ({ id }))
            : undefined
    };
}

function guideUpdateData(guide: GuideInput) {
    const curriculumId =
        guide.curriculum?.source === "SAVED"
            ? guide.curriculum.saved.curriculumId
            : null;
    const suggestionId =
        guide.curriculum?.source === "SUGGESTION"
            ? guide.curriculum.suggestion.suggestionId
            : null;
    const program = guide.program;
    const data = {
        guideMode: guide.mode,
        curriculumSource: guide.curriculum?.source ?? null,
        curriculum:
            curriculumId === null
                ? { disconnect: true }
                : { connect: { id: curriculumId } },
        curriculumSuggestion:
            suggestionId === null
                ? { disconnect: true }
                : { connect: { id: suggestionId } },
        catalogProgram:
            program == null
                ? { disconnect: true }
                : { connect: { id: program.catalogProgramId } },
        catalogProgramVariant:
            program == null
                ? { disconnect: true }
                : { connect: { id: program.catalogProgramVariantId } },
        language:
            program == null || program.languageId === null
                ? { disconnect: true }
                : { connect: { id: program.languageId } },
        manualCourses: {
            deleteMany: {},
            create: guide.manualCourseIds.map((courseId) => ({
                course: { connect: { id: courseId } }
            }))
        }
    };
    return {
        ...data,
        curriculumSource:
            guide.curriculum === undefined ? undefined : data.curriculumSource,
        curriculum:
            guide.curriculum === undefined ? undefined : data.curriculum,
        curriculumSuggestion:
            guide.curriculum === undefined
                ? undefined
                : data.curriculumSuggestion,
        catalogProgram: program === undefined ? undefined : data.catalogProgram,
        catalogProgramVariant:
            program === undefined ? undefined : data.catalogProgramVariant,
        language: program === undefined ? undefined : data.language
    };
}

function guideCreateData(guide: GuideInput) {
    const update = guideUpdateData(guide);
    return {
        guideMode: update.guideMode,
        curriculumSource: update.curriculumSource,
        ...(update.curriculum?.connect
            ? { curriculum: update.curriculum }
            : {}),
        ...(update.curriculumSuggestion?.connect
            ? { curriculumSuggestion: update.curriculumSuggestion }
            : {}),
        ...(update.catalogProgram?.connect
            ? { catalogProgram: update.catalogProgram }
            : {}),
        ...(update.catalogProgramVariant?.connect
            ? { catalogProgramVariant: update.catalogProgramVariant }
            : {}),
        ...(update.language?.connect ? { language: update.language } : {}),
        manualCourses: {
            create: guide.manualCourseIds.map((courseId) => ({
                course: { connect: { id: courseId } }
            }))
        }
    };
}

function load(prisma: PrismaClient, userId: number, id: number) {
    return prisma.periodPlanning.findUnique({
        ...prismaPeriodPlanningFieldSelection,
        where: { userId, id }
    });
}

export function createPeriodPlanService({
    prisma
}: {
    prisma: PrismaClient;
}): PeriodPlanService {
    return {
        async list(userId, query) {
            const pagination = resolvePagination(query, unpaginatedByDefault);
            const where: MyPrisma.PeriodPlanningWhereInput = { userId };
            const total = await prisma.periodPlanning.count({ where });
            return {
                items: (
                    await prisma.periodPlanning.findMany({
                        ...prismaPaginationParams(pagination),
                        ...prismaPeriodPlanningFieldSelection,
                        where,
                        orderBy: compileSort(
                            resolveSort(query.sort, periodPlanningSort),
                            {
                                updatedAt: (direction) => ({
                                    updatedAt: direction
                                }),
                                name: (direction) => ({ name: direction }),
                                studyPeriodYear: (direction) => ({
                                    studyPeriod: { year: direction }
                                }),
                                studyPeriodYearPeriod: (direction) => ({
                                    studyPeriod: { yearPeriod: direction }
                                }),
                                visibility: (direction) => ({
                                    visibility: direction
                                }),
                                id: (direction) => ({ id: direction })
                            }
                        )
                    })
                ).map(periodPlanningPresenter.build),
                total,
                pagination
            };
        },
        async getById(userId, id) {
            const periodPlan = await load(prisma, userId, id);
            return periodPlan
                ? ok(periodPlanningPresenter.build(periodPlan))
                : err(periodPlanNotFoundProblem());
        },
        async create(userId, input) {
            const guide = input.guide ?? {
                mode: "NONE" as const,
                manualCourseIds: []
            };
            const studyPeriod = await prisma.studyPeriod.findUnique({
                where: { id: input.studyPeriodId },
                select: { id: true, year: true, yearPeriod: true }
            });
            const fields: ProblemField[] = studyPeriod
                ? []
                : [
                      {
                          path: ["studyPeriodId"],
                          code: "REFERENCE_NOT_FOUND",
                          message: "O período letivo não foi encontrado."
                      }
                  ];
            fields.push(
                ...(await classFields(
                    prisma,
                    input.classes,
                    input.studyPeriodId,
                    ["classes"]
                )),
                ...(await guideFields(prisma, guide, userId))
            );
            if (fields.length) return err(periodPlanInputProblem(fields));
            const periodPlan = await prisma.periodPlanning.create({
                ...prismaPeriodPlanningFieldSelection,
                data: {
                    user: { connect: { id: userId } },
                    studyPeriod: { connect: { id: input.studyPeriodId } },
                    name:
                        input.name ??
                        `Planejamento ${
                            studyPeriod
                                ? studyPeriodCode(
                                      studyPeriod.year,
                                      studyPeriod.yearPeriod
                                  )
                                : ""
                        }`,
                    ...guideCreateData(guide),
                    classes: {
                        connect: [...input.classes].map((id) => ({ id }))
                    }
                }
            });
            return ok(periodPlanningPresenter.build(periodPlan));
        },
        async patch(userId, id, input) {
            const existing = await load(prisma, userId, id);
            if (!existing) return err(periodPlanNotFoundProblem());
            const guide = input.guide;
            const fields = guide
                ? await guideFields(prisma, guide, userId)
                : [];
            if (input.classes) {
                const ids = resolvePeriodPlanClasses(
                    existing.classes.map(({ id }) => id),
                    input.classes
                );
                fields.push(
                    ...(await classFields(prisma, ids, existing.studyPeriodId, [
                        "classes",
                        input.classes.set ? "set" : "add"
                    ]))
                );
            }
            if (fields.length) return err(periodPlanInputProblem(fields));
            const periodPlan = await prisma.periodPlanning.update({
                ...prismaPeriodPlanningFieldSelection,
                where: { id },
                data: {
                    ...(input.name !== undefined && { name: input.name }),
                    ...(input.visibility !== undefined && {
                        visibility: input.visibility
                    }),
                    ...(guide ? guideUpdateData(guide) : {}),
                    ...(input.classes
                        ? { classes: classUpdateData(input.classes) }
                        : {})
                }
            });
            return ok(periodPlanningPresenter.build(periodPlan));
        },
        async remove(userId, id) {
            const existing = await prisma.periodPlanning.findUnique({
                where: { userId, id },
                select: { id: true }
            });
            if (!existing) return err(periodPlanNotFoundProblem());
            await prisma.periodPlanning.delete({ where: { id } });
            return ok(undefined);
        }
    };
}
