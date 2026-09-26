import { readFile } from "node:fs/promises";
import {
    withAuditTransaction,
    type InjectionAuditContext
} from "../audit-context.js";
import type { InjectionContext } from "./InjectionTypes.js";
import { legacyCourseCode, normalizeCourseCode } from "./course-code.js";
import { unwrapScrapeData } from "./scrape-input.js";

export type SuggestionsInjectionOptions = {
    concurrency?: number;
    transactionTimeout?: number;
    transactionMaxWait?: number;
};

type CourseInput = { code: string };
type SemesterInput = {
    semester: number;
    elective_credits?: number;
    electiveCredits?: number;
    courses: CourseInput[];
};
type SuggestionInput = {
    code?: string;
    name: string;
    semesters: SemesterInput[];
};
type ProgramInput = {
    code: number;
    suggestions: SuggestionInput[];
};
type CatalogInput = { year: number; programs: ProgramInput[] };
type Input = { catalogs: CatalogInput[] };
type CatalogProgramLookup = {
    id: number;
    generalVariantId: number | null;
    specializedVariants: Map<string, number>;
};

function normalizeSuggestion(suggestion: SuggestionInput) {
    const [rawCode, ...nameParts] = suggestion.name.split(" - ");
    const code = normalizeCourseCode(suggestion.code ?? rawCode);
    const name =
        suggestion.code && normalizeCourseCode(rawCode) !== code
            ? suggestion.name
            : nameParts.join(" - ");
    if (!name) throw new Error(`sugestão ${code} sem nome`);
    return { code, name };
}

async function importSuggestion(
    catalog: CatalogInput,
    program: ProgramInput,
    suggestion: SuggestionInput,
    catalogPrograms: Map<string, CatalogProgramLookup>,
    courseIds: Map<string, number>,
    transactionTimeout: number,
    transactionMaxWait: number,
    prisma: InjectionContext["prisma"],
    auditContext: InjectionAuditContext,
    logger: InjectionContext["logger"],
    changes: Parameters<InjectionContext["logger"]["change"]>[0][]
) {
    const catalogProgram = catalogPrograms.get(
        `${catalog.year}:${program.code}`
    );
    if (!catalogProgram) {
        logger.warn(
            `[${catalog.year}] programa ${program.code}: CatalogProgram ausente; sugestão ignorada.`
        );
        return { semesters: 0, courses: 0, missingCourses: 0 };
    }

    const { code } = normalizeSuggestion(suggestion);

    return withAuditTransaction(
        prisma,
        auditContext,
        async (tx) => {
            const catalogProgramVariantId =
                catalogProgram.specializedVariants.get(code) ??
                (catalogProgram.specializedVariants.size === 0
                    ? catalogProgram.generalVariantId
                    : null);
            if (catalogProgramVariantId === null)
                throw new Error(
                    `sugestão ${code} não corresponde a uma variante do catálogo`
                );
            const existing = await tx.curriculumSuggestion.findUnique({
                where: { catalogProgramVariantId },
                select: { id: true }
            });
            const persisted = await tx.curriculumSuggestion.upsert({
                where: { catalogProgramVariantId },
                create: { catalogProgramVariantId },
                update: {},
                select: { id: true }
            });
            if (!existing)
                changes.push({
                    entity: "CurriculumSuggestion",
                    operation: "create",
                    key: { id: persisted.id, code },
                    before: null,
                    after: { catalogProgramVariantId }
                });
            await tx.semesterSuggestion.deleteMany({
                where: { suggestionId: persisted.id }
            });
            await tx.semesterSuggestion.createMany({
                data: suggestion.semesters.map((semester) => ({
                    suggestionId: persisted.id,
                    semester: semester.semester,
                    electiveCredits:
                        semester.electiveCredits ??
                        semester.elective_credits ??
                        0
                }))
            });
            const persistedSemesters = new Map(
                (
                    await tx.semesterSuggestion.findMany({
                        where: { suggestionId: persisted.id },
                        select: { id: true, semester: true }
                    })
                ).map((semester) => [semester.semester, semester.id])
            );
            const missing = new Set<string>();
            const suggestionCourses: Array<{
                semesterSuggestionId: number;
                courseId: number;
            }> = [];
            for (const semester of suggestion.semesters) {
                const semesterSuggestionId = persistedSemesters.get(
                    semester.semester
                );
                if (semesterSuggestionId === undefined)
                    throw new Error(
                        `semestre ${semester.semester} não persistido`
                    );
                for (const inputCourse of semester.courses) {
                    const courseCode = normalizeCourseCode(inputCourse.code);
                    const courseId = courseIds.get(courseCode);
                    if (courseId === undefined) {
                        missing.add(courseCode);
                        continue;
                    }
                    suggestionCourses.push({ semesterSuggestionId, courseId });
                }
            }
            if (suggestionCourses.length > 0)
                await tx.suggestionCourse.createMany({
                    data: suggestionCourses,
                    skipDuplicates: true
                });
            if (missing.size > 0)
                logger.warn(
                    `[${catalog.year}] programa ${program.code}, sugestão ${suggestion.name}: ${missing.size} disciplinas ausentes (${[...missing].join(", ")}); ignoradas.`
                );
            return {
                semesters: suggestion.semesters.length,
                courses: suggestionCourses.length,
                missingCourses: missing.size
            };
        },
        { timeout: transactionTimeout, maxWait: transactionMaxWait }
    );
}

async function runWithConcurrency<T>(
    tasks: T[],
    concurrency: number,
    operation: (task: T) => Promise<void>
) {
    let next = 0;
    await Promise.all(
        Array.from(
            { length: Math.min(concurrency, tasks.length) },
            async () => {
                while (next < tasks.length) {
                    const task = tasks[next];
                    next += 1;
                    await operation(task);
                }
            }
        )
    );
}

export async function injectSuggestions(
    { prisma, inputPath, logger, auditContext }: InjectionContext,
    {
        concurrency = 4,
        transactionTimeout = 120_000,
        transactionMaxWait = 60_000
    }: SuggestionsInjectionOptions = {}
) {
    if (!Number.isInteger(concurrency) || concurrency < 1)
        throw new Error("concurrency deve ser um inteiro positivo");
    if (!Number.isInteger(transactionTimeout) || transactionTimeout < 1)
        throw new Error("transactionTimeout deve ser um inteiro positivo");
    if (!Number.isInteger(transactionMaxWait) || transactionMaxWait < 1)
        throw new Error("transactionMaxWait deve ser um inteiro positivo");
    const input = unwrapScrapeData(
        JSON.parse(await readFile(inputPath, "utf8"))
    ) as Input;
    const persistedCatalogPrograms = await prisma.catalogProgram.findMany({
        select: {
            id: true,
            catalog: { select: { year: true } },
            program: { select: { code: true } },
            variants: {
                select: {
                    id: true,
                    programId: true,
                    specialization: { select: { code: true } }
                }
            }
        }
    });
    const catalogPrograms = new Map(
        persistedCatalogPrograms.map((catalogProgram) => [
            `${catalogProgram.catalog.year}:${catalogProgram.program.code}`,
            {
                id: catalogProgram.id,
                generalVariantId:
                    catalogProgram.variants.find(
                        (variant) => variant.programId !== null
                    )?.id ?? null,
                specializedVariants: new Map(
                    catalogProgram.variants.flatMap((variant) =>
                        variant.specialization
                            ? [
                                  [
                                      normalizeCourseCode(
                                          variant.specialization.code
                                      ),
                                      variant.id
                                  ] as const
                              ]
                            : []
                    )
                )
            }
        ])
    );
    const requestedCourseCodes = [
        ...new Set(
            input.catalogs.flatMap((catalog) =>
                catalog.programs.flatMap((program) =>
                    program.suggestions.flatMap((suggestion) =>
                        suggestion.semesters.flatMap((semester) =>
                            semester.courses.map(({ code }) =>
                                normalizeCourseCode(code)
                            )
                        )
                    )
                )
            )
        )
    ];
    const courseIds = new Map(
        (
            await prisma.course.findMany({
                where: {
                    code: {
                        in: [
                            ...new Set(
                                requestedCourseCodes.flatMap((code) => [
                                    code,
                                    legacyCourseCode(code)
                                ])
                            )
                        ]
                    }
                },
                select: { id: true, code: true }
            })
        ).map((course) => [normalizeCourseCode(course.code), course.id])
    );
    const tasks = input.catalogs.flatMap((catalog) =>
        catalog.programs.flatMap((program) =>
            program.suggestions.map((suggestion) => ({
                catalog,
                program,
                suggestion
            }))
        )
    );
    const changes = [] as Parameters<InjectionContext["logger"]["change"]>[0][];
    let importedSuggestions = 0;
    let importedCourses = 0;
    let missingCourses = 0;
    await runWithConcurrency(
        tasks,
        concurrency,
        async ({ catalog, program, suggestion }) => {
            try {
                const result = await importSuggestion(
                    catalog,
                    program,
                    suggestion,
                    catalogPrograms,
                    courseIds,
                    transactionTimeout,
                    transactionMaxWait,
                    prisma,
                    auditContext,
                    logger,
                    changes
                );
                importedSuggestions += result.semesters > 0 ? 1 : 0;
                importedCourses += result.courses;
                missingCourses += result.missingCourses;
            } catch (error) {
                logger.warn(
                    `[${catalog.year}] programa ${program.code}, sugestão ${suggestion.code ?? suggestion.name}: importação ignorada: ${error}`
                );
            }
        }
    );
    for (const change of changes) logger.change(change);
    logger.info(
        JSON.stringify(
            { importedSuggestions, importedCourses, missingCourses },
            null,
            2
        )
    );
}
