import { CatalogCreditLimitType, CatalogProgramShift } from "@pomi/db";
import { readFile } from "node:fs/promises";
import { withAuditTransaction } from "../audit-context.js";
import type { InjectionContext } from "./InjectionTypes.js";
import { unwrapScrapeData } from "./scrape-input.js";

type VariantInformation = {
    specializationCode: string | null;
    specializationName: string | null;
    integralizationCredits: number | null;
    integralizationSupervisedHours: number | null;
    integralizationExtensionHours: number | null;
    integralizationSemesters: number | null;
    integralizationMaximumSemesters: number | null;
    professionalDescription: string | null;
    recognitionDescription: string | null;
};

type ProgramInformation = {
    shift: CatalogProgramShift | null;
    creditLimitType: CatalogCreditLimitType | null;
    creditLimitFixedCredits: number | null;
    creditLimitBeforeThresholdCredits: number | null;
    creditLimitThresholdCredits: number | null;
    creditLimitCrBase: number | null;
    creditLimitCrMultiplier: number | null;
    professionalPracticeDescription: string | null;
    variants: VariantInformation[];
};

type Input = {
    catalogs: Array<{
        year: number;
        programs: Array<{
            code: number;
            information: ProgramInformation | null;
        }>;
    }>;
};

export class CatalogInformationValidationError extends Error {}

export function normalizeCatalogInformation(value: unknown): Input {
    const input = unwrapScrapeData(value) as { catalogs?: unknown };
    if (!input || !Array.isArray(input.catalogs))
        throw new CatalogInformationValidationError(
            "O arquivo de informações deve conter data.catalogs"
        );
    return {
        catalogs: input.catalogs.map((rawCatalog) => {
            const catalog = rawCatalog as {
                year?: unknown;
                programs?: unknown;
            };
            if (
                !Number.isInteger(catalog.year) ||
                !Array.isArray(catalog.programs)
            )
                throw new CatalogInformationValidationError(
                    "Catálogo de informações em formato inválido"
                );
            return {
                year: catalog.year as number,
                programs: catalog.programs.map((rawProgram) => {
                    const program = rawProgram as {
                        code?: unknown;
                        information?: unknown;
                    };
                    if (
                        !Number.isInteger(program.code) ||
                        (program.information !== null &&
                            (typeof program.information !== "object" ||
                                program.information === null ||
                                !Array.isArray(
                                    (program.information as ProgramInformation)
                                        .variants
                                )))
                    )
                        throw new CatalogInformationValidationError(
                            `Programa inválido no catálogo ${catalog.year}`
                        );
                    return {
                        code: program.code as number,
                        information:
                            program.information as ProgramInformation | null
                    };
                })
            };
        })
    };
}

export type CatalogInformationInjectionOptions = {
    transactionTimeout?: number;
    transactionMaxWait?: number;
};

export async function injectCatalogInformation(
    { prisma, inputPath, logger, auditContext }: InjectionContext,
    {
        transactionTimeout = 120_000,
        transactionMaxWait = 60_000
    }: CatalogInformationInjectionOptions = {}
) {
    const input = normalizeCatalogInformation(
        JSON.parse(await readFile(inputPath, "utf8"))
    );
    let importedPrograms = 0;
    let importedVariants = 0;

    for (const catalog of input.catalogs) {
        for (const program of catalog.programs) {
            if (!program.information) {
                logger.warn(
                    `[${catalog.year}] programa ${program.code}: informações ausentes; importação ignorada.`
                );
                continue;
            }
            const information = program.information;
            const validVariants = information.variants.filter((variant) => {
                const valid =
                    Boolean(variant.specializationCode) ===
                    Boolean(variant.specializationName);
                if (!valid)
                    logger.warn(
                        `[${catalog.year}] programa ${program.code}: variante com especialização incompleta ignorada.`
                    );
                return valid;
            });
            const imported = await withAuditTransaction(
                prisma,
                auditContext,
                async (tx) => {
                    const persistedProgram = await tx.program.findUnique({
                        where: { code: program.code },
                        select: { id: true }
                    });
                    if (!persistedProgram) return null;
                    const persistedCatalog = await tx.catalog.upsert({
                        where: { year: catalog.year },
                        create: { year: catalog.year },
                        update: {},
                        select: { id: true }
                    });
                    const catalogProgram = await tx.catalogProgram.upsert({
                        where: {
                            catalogId_programId: {
                                catalogId: persistedCatalog.id,
                                programId: persistedProgram.id
                            }
                        },
                        create: {
                            catalogId: persistedCatalog.id,
                            programId: persistedProgram.id
                        },
                        update: {},
                        select: { id: true, programId: true }
                    });

                    await tx.catalogProgram.update({
                        where: { id: catalogProgram.id },
                        data: {
                            shift: information.shift,
                            creditLimitType: information.creditLimitType,
                            creditLimitFixedCredits:
                                information.creditLimitFixedCredits,
                            creditLimitBeforeThresholdCredits:
                                information.creditLimitBeforeThresholdCredits,
                            creditLimitThresholdCredits:
                                information.creditLimitThresholdCredits,
                            creditLimitCrBase: information.creditLimitCrBase,
                            creditLimitCrMultiplier:
                                information.creditLimitCrMultiplier,
                            professionalPracticeDescription:
                                information.professionalPracticeDescription
                        }
                    });

                    let variants = 0;
                    for (const variant of validVariants) {
                        const {
                            specializationCode,
                            specializationName,
                            ...variantData
                        } = variant;
                        let specialization: { id: number } | null = null;
                        if (specializationCode && specializationName) {
                            specialization = await tx.specialization.upsert({
                                where: {
                                    programId_code: {
                                        programId: catalogProgram.programId,
                                        code: specializationCode
                                    }
                                },
                                create: {
                                    programId: catalogProgram.programId,
                                    code: specializationCode,
                                    name: specializationName
                                },
                                update: { name: specializationName },
                                select: { id: true }
                            });
                        }

                        const identity = specialization
                            ? {
                                  catalogProgramId_specializationId: {
                                      catalogProgramId: catalogProgram.id,
                                      specializationId: specialization.id
                                  }
                              }
                            : {
                                  catalogProgramId_programId: {
                                      catalogProgramId: catalogProgram.id,
                                      programId: catalogProgram.programId
                                  }
                              };
                        await tx.catalogProgramVariant.upsert({
                            where: identity,
                            create: {
                                catalogProgramId: catalogProgram.id,
                                programId: specialization
                                    ? null
                                    : catalogProgram.programId,
                                specializationId: specialization?.id ?? null,
                                ...variantData
                            },
                            update: variantData
                        });
                        variants += 1;
                    }
                    return variants;
                },
                { timeout: transactionTimeout, maxWait: transactionMaxWait }
            );
            if (imported === null) {
                logger.warn(
                    `[${catalog.year}] programa ${program.code}: Program ausente; importação ignorada.`
                );
                continue;
            }
            importedPrograms += 1;
            importedVariants += imported;
        }
    }

    logger.info(
        JSON.stringify({ importedPrograms, importedVariants }, null, 2)
    );
}
