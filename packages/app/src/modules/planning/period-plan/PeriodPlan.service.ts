import IO, {
    createBody,
    guideInputSchema,
    patchBody,
    periodPlanningListQuery,
    periodPlanningSort
} from "#/modules/planning/period-plan/PeriodPlan.contract.js";
import periodPlanningEntity from "#/modules/planning/period-plan/PeriodPlan.entity.js";
import {
    periodPlanInputProblem,
    periodPlanNotFoundProblem,
    type PeriodPlanProblem
} from "#/modules/planning/period-plan/PeriodPlan.problems.js";
import {
    compileSort,
    err,
    ok,
    resolveSort,
    type ProblemField,
    type Result
} from "@pomi/api-core";
import { studyPeriodCode, type PrismaClient } from "@pomi/db";
import z from "zod";

type PeriodPlan = z.infer<typeof IO.schema>;
type ListQuery = z.infer<typeof periodPlanningListQuery>;
type GuideInput = z.infer<typeof guideInputSchema>;
export type CreatePeriodPlanInput = z.infer<typeof createBody>;
export type PatchPeriodPlanInput = z.infer<typeof patchBody>;

export type PeriodPlanService = {
    list(studentId: number, query: ListQuery): Promise<PeriodPlan[]>;
    getById(
        studentId: number,
        id: number
    ): Promise<
        Result<PeriodPlan, ReturnType<typeof periodPlanNotFoundProblem>>
    >;
    create(
        studentId: number,
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
        studentId: number,
        id: number,
        input: PatchPeriodPlanInput
    ): Promise<Result<PeriodPlan, PeriodPlanProblem>>;
    remove(
        studentId: number,
        id: number
    ): Promise<Result<void, ReturnType<typeof periodPlanNotFoundProblem>>>;
};

function legacyGuide(curriculumId: number | null | undefined): GuideInput {
    return curriculumId == null
        ? { mode: "NONE", manualCourseIds: [] }
        : {
              mode: "CURRICULUM",
              curriculum: {
                  source: "SAVED",
                  saved: { curriculumId }
              },
              manualCourseIds: []
          };
}

async function guideFields(
    prisma: PrismaClient,
    guide: GuideInput,
    studentId: number
): Promise<ProblemField[]> {
    const fields: ProblemField[] = [];
    if (guide.mode === "CURRICULUM" && guide.curriculum.source === "SAVED") {
        const curriculumId = guide.curriculum.saved.curriculumId;
        const curriculum = await prisma.curriculum.findFirst({
            where: { id: curriculumId, studentId },
            select: { id: true }
        });
        if (!curriculum)
            fields.push({
                path: ["guide", "curriculum", "saved", "curriculumId"],
                code: "REFERENCE_NOT_FOUND",
                message: "O currículo salvo não pertence a este estudante."
            });
    }
    if (
        guide.mode === "CURRICULUM" &&
        guide.curriculum.source === "SUGGESTION"
    ) {
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
        if (!suggestion)
            fields.push({
                path: ["guide", "curriculum", "suggestion", "suggestionId"],
                code: "REFERENCE_NOT_FOUND",
                message: "A sugestão curricular não foi encontrada."
            });
        else if (
            suggestion.catalogProgramVariant.catalogProgramId !==
            catalogProgramId
        )
            fields.push({
                path: ["guide", "curriculum", "suggestion", "catalogProgramId"],
                code: "INVALID_VALUE",
                message: "A sugestão não pertence ao programa de catálogo."
            });
    }
    if (guide.mode === "PROGRAM") {
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
            prisma.catalogLanguage.findFirst({
                where: { languageId, catalogProgramId },
                select: { languageId: true }
            })
        ]);
        if (!program)
            fields.push({
                path: ["guide", "program", "catalogProgramId"],
                code: "REFERENCE_NOT_FOUND",
                message: "O programa de catálogo não foi encontrado."
            });
        if (!variant)
            fields.push({
                path: ["guide", "program", "catalogProgramVariantId"],
                code: "REFERENCE_NOT_FOUND",
                message: "A variante não está disponível para o programa."
            });
        if (!language)
            fields.push({
                path: ["guide", "program", "languageId"],
                code: "REFERENCE_NOT_FOUND",
                message: "A língua não está disponível para o programa."
            });
    }

    const courseIds = [...new Set(guide.manualCourseIds)];
    if (courseIds.length) {
        const courses = await prisma.course.findMany({
            where: { id: { in: courseIds } },
            select: { id: true }
        });
        const found = new Set(courses.map(({ id }) => id));
        for (const id of courseIds)
            if (!found.has(id))
                fields.push({
                    path: ["guide", "manualCourseIds", String(id)],
                    code: "REFERENCE_NOT_FOUND",
                    message: `A disciplina ${id} não foi encontrada.`
                });
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
    const byId = new Map(classes.map((item) => [item.id, item]));
    const fields: ProblemField[] = [];
    for (const id of classIds) {
        const classEntity = byId.get(id);
        if (!classEntity)
            fields.push({
                code: "REFERENCE_NOT_FOUND",
                path: [...path, String(id)],
                message: `A turma ${id} não foi encontrada.`
            });
        else if (classEntity.studyPeriodId !== studyPeriodId)
            fields.push({
                code: "INVALID_VALUE",
                path: [...path, String(id)],
                message: `A turma ${id} pertence a outro período letivo.`
            });
    }
    const firstClassByCourse = new Map<number, number>();
    for (const classEntity of classes) {
        const firstId = firstClassByCourse.get(classEntity.courseId);
        if (firstId === undefined)
            firstClassByCourse.set(classEntity.courseId, classEntity.id);
        else
            fields.push({
                code: "INVALID_VALUE",
                path: [...path, String(classEntity.id)],
                message: `As turmas ${firstId} e ${classEntity.id} são da mesma disciplina.`
            });
    }
    return fields;
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
        guide.mode === "CURRICULUM" && guide.curriculum.source === "SAVED"
            ? guide.curriculum.saved.curriculumId
            : null;
    const suggestionId =
        guide.mode === "CURRICULUM" && guide.curriculum.source === "SUGGESTION"
            ? guide.curriculum.suggestion.suggestionId
            : null;
    const program = guide.mode === "PROGRAM" ? guide.program : null;
    return {
        guideMode: guide.mode,
        curriculumSource:
            guide.mode === "CURRICULUM" ? guide.curriculum.source : null,
        curriculum:
            curriculumId === null
                ? { disconnect: true }
                : { connect: { id: curriculumId } },
        curriculumSuggestion:
            suggestionId === null
                ? { disconnect: true }
                : { connect: { id: suggestionId } },
        catalogProgram:
            program === null
                ? { disconnect: true }
                : { connect: { id: program.catalogProgramId } },
        catalogProgramVariant:
            program === null
                ? { disconnect: true }
                : { connect: { id: program.catalogProgramVariantId } },
        language:
            program === null
                ? { disconnect: true }
                : { connect: { id: program.languageId } },
        manualCourses: {
            deleteMany: {},
            create: guide.manualCourseIds.map((courseId) => ({
                course: { connect: { id: courseId } }
            }))
        }
    };
}

function guideCreateData(guide: GuideInput) {
    const update = guideUpdateData(guide);
    return {
        guideMode: update.guideMode,
        curriculumSource: update.curriculumSource,
        ...(update.curriculum.connect ? { curriculum: update.curriculum } : {}),
        ...(update.curriculumSuggestion.connect
            ? { curriculumSuggestion: update.curriculumSuggestion }
            : {}),
        ...(update.catalogProgram.connect
            ? { catalogProgram: update.catalogProgram }
            : {}),
        ...(update.catalogProgramVariant.connect
            ? { catalogProgramVariant: update.catalogProgramVariant }
            : {}),
        ...(update.language.connect ? { language: update.language } : {}),
        manualCourses: update.manualCourses
    };
}

function load(prisma: PrismaClient, studentId: number, id: number) {
    return prisma.periodPlanning.findUnique({
        ...periodPlanningEntity.prismaSelection,
        where: { studentId, id }
    });
}

export function createPeriodPlanService({
    prisma
}: {
    prisma: PrismaClient;
}): PeriodPlanService {
    return {
        async list(studentId, query) {
            return (
                await prisma.periodPlanning.findMany({
                    ...periodPlanningEntity.prismaSelection,
                    where: { studentId },
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
            ).map(periodPlanningEntity.build);
        },
        async getById(studentId, id) {
            const periodPlan = await load(prisma, studentId, id);
            return periodPlan
                ? ok(periodPlanningEntity.build(periodPlan))
                : err(periodPlanNotFoundProblem());
        },
        async create(studentId, input) {
            const guide = input.guide ?? legacyGuide(input.curriculumId);
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
                ...(await guideFields(prisma, guide, studentId))
            );
            if (fields.length) return err(periodPlanInputProblem(fields));
            const periodPlan = await prisma.periodPlanning.create({
                ...periodPlanningEntity.prismaSelection,
                data: {
                    student: { connect: { id: studentId } },
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
            return ok(periodPlanningEntity.build(periodPlan));
        },
        async patch(studentId, id, input) {
            const existing = await load(prisma, studentId, id);
            if (!existing) return err(periodPlanNotFoundProblem());
            const requestedGuide =
                input.guide !== undefined
                    ? input.guide
                    : input.curriculumId !== undefined
                      ? legacyGuide(input.curriculumId)
                      : undefined;
            const guide = requestedGuide;
            const fields = guide
                ? await guideFields(prisma, guide, studentId)
                : [];
            if (input.classes) {
                const ids = input.classes.set
                    ? new Set(input.classes.set)
                    : new Set([
                          ...existing.classes
                              .map(({ id: classId }) => classId)
                              .filter(
                                  (classId) =>
                                      !input.classes?.remove?.has(classId)
                              ),
                          ...(input.classes.add ?? [])
                      ]);
                fields.push(
                    ...(await classFields(prisma, ids, existing.studyPeriodId, [
                        "classes",
                        input.classes.set ? "set" : "add"
                    ]))
                );
            }
            if (fields.length) return err(periodPlanInputProblem(fields));
            const periodPlan = await prisma.periodPlanning.update({
                ...periodPlanningEntity.prismaSelection,
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
            return ok(periodPlanningEntity.build(periodPlan));
        },
        async remove(studentId, id) {
            const existing = await prisma.periodPlanning.findUnique({
                where: { studentId, id },
                select: { id: true }
            });
            if (!existing) return err(periodPlanNotFoundProblem());
            await prisma.periodPlanning.delete({ where: { id } });
            return ok(undefined);
        }
    };
}
