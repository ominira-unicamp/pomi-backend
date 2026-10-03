import type { PrismaClient } from "@pomi/db";
import { readFile } from "node:fs/promises";
import { withAuditTransaction } from "../audit-context.js";
import { normalizeCatalogInformation } from "./CatalogInformationInjection.js";
import { normalizeCatalogs } from "./CatalogInjection.js";
import type { InjectionContext } from "./InjectionTypes.js";

export type ExpectedVariants = {
    program: boolean;
    specializations: Set<string>;
};

type ExistingVariant = {
    id: number;
    programId: number | null;
    specialization: { id: number; code: string } | null;
};

export type VariantReconciliationPlan = {
    staleVariantIds: number[];
    staleSpecializationIds: number[];
    missing: string[];
};

function validSpecializationName(name: string) {
    return /[\p{L}\p{N}]/u.test(name);
}

function expectedEntry(
    entries: Map<number, ExpectedVariants>,
    programCode: number
) {
    const current = entries.get(programCode) ?? {
        program: false,
        specializations: new Set<string>()
    };
    entries.set(programCode, current);
    return current;
}

export async function expectedCatalogProgramVariants({
    year,
    curriculaPath,
    informationPath
}: {
    year: number;
    curriculaPath: string;
    informationPath: string;
}) {
    const [curricula, information] = await Promise.all([
        readFile(curriculaPath, "utf8").then((value) =>
            normalizeCatalogs(JSON.parse(value))
        ),
        readFile(informationPath, "utf8").then((value) =>
            normalizeCatalogInformation(JSON.parse(value))
        )
    ]);
    const expected = new Map<number, ExpectedVariants>();
    const curriculum = curricula.find((catalog) => catalog.year === year);
    const catalogInformation = information.catalogs.find(
        (catalog) => catalog.year === year
    );
    if (!curriculum || !catalogInformation)
        throw new Error(
            `Componentes completos ausentes para o catálogo ${year}`
        );

    for (const program of curriculum.programs ?? []) {
        const entry = expectedEntry(expected, program.code);
        for (const specialization of program.specializations) {
            if (!validSpecializationName(specialization.name))
                throw new Error(
                    `[${year}] programa ${program.code}: especialização ${specialization.code} sem nome válido`
                );
            entry.specializations.add(specialization.code);
        }
    }
    for (const program of catalogInformation.programs) {
        if (!program.information)
            throw new Error(
                `[${year}] programa ${program.code}: informações ausentes em snapshot completo`
            );
        const entry = expectedEntry(expected, program.code);
        for (const variant of program.information.variants) {
            const hasCode = Boolean(variant.specializationCode);
            const hasName = Boolean(variant.specializationName);
            if (hasCode !== hasName)
                throw new Error(
                    `[${year}] programa ${program.code}: variante com especialização incompleta`
                );
            if (!hasCode) {
                entry.program = true;
                continue;
            }
            if (!validSpecializationName(variant.specializationName!))
                throw new Error(
                    `[${year}] programa ${program.code}: especialização ${variant.specializationCode} sem nome válido`
                );
            entry.specializations.add(variant.specializationCode!);
        }
    }
    return expected;
}

export function planVariantReconciliation(
    existing: ExistingVariant[],
    expected: ExpectedVariants
): VariantReconciliationPlan {
    const staleVariantIds: number[] = [];
    const staleSpecializationIds: number[] = [];
    let hasProgram = false;
    const existingSpecializations = new Set<string>();

    for (const variant of existing) {
        if (variant.programId !== null) {
            hasProgram = true;
            if (!expected.program) staleVariantIds.push(variant.id);
            continue;
        }
        if (!variant.specialization)
            throw new Error(`Variante ${variant.id} sem identidade válida`);
        existingSpecializations.add(variant.specialization.code);
        if (!expected.specializations.has(variant.specialization.code)) {
            staleVariantIds.push(variant.id);
            staleSpecializationIds.push(variant.specialization.id);
        }
    }

    const missing = [
        ...(expected.program && !hasProgram ? ["PROGRAM"] : []),
        ...[...expected.specializations]
            .filter((code) => !existingSpecializations.has(code))
            .sort()
    ];
    return { staleVariantIds, staleSpecializationIds, missing };
}

type TransactionClient = Omit<
    PrismaClient,
    "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

async function reconcileProgram(
    tx: TransactionClient,
    catalogProgramId: number,
    expected: ExpectedVariants,
    dryRun: boolean
) {
    const existing = await tx.catalogProgramVariant.findMany({
        where: { catalogProgramId },
        select: {
            id: true,
            programId: true,
            specialization: { select: { id: true, code: true } }
        }
    });
    const plan = planVariantReconciliation(existing, expected);
    if (plan.missing.length > 0)
        throw new Error(
            `CatalogProgram ${catalogProgramId}: variantes esperadas não persistidas (${plan.missing.join(", ")})`
        );
    if (plan.staleVariantIds.length === 0) return plan;

    const [curricula, periodPlannings] = await Promise.all([
        tx.curriculum.count({
            where: {
                catalogProgramVariantId: { in: plan.staleVariantIds }
            }
        }),
        tx.periodPlanning.count({
            where: {
                catalogProgramVariantId: { in: plan.staleVariantIds }
            }
        })
    ]);
    if (curricula > 0 || periodPlannings > 0)
        throw new Error(
            `CatalogProgram ${catalogProgramId}: variantes obsoletas referenciadas por ${curricula} currículo(s) e ${periodPlannings} planejamento(s)`
        );

    if (dryRun) return plan;

    await tx.catalogProgramVariant.deleteMany({
        where: { id: { in: plan.staleVariantIds } }
    });
    for (const specializationId of new Set(plan.staleSpecializationIds)) {
        const [variants, students] = await Promise.all([
            tx.catalogProgramVariant.count({ where: { specializationId } }),
            tx.student.count({ where: { specializationId } })
        ]);
        if (variants === 0 && students === 0)
            await tx.specialization.delete({ where: { id: specializationId } });
    }
    return plan;
}

export async function reconcileCatalogProgramVariants(
    { prisma, logger, auditContext }: InjectionContext,
    {
        year,
        curriculaPath,
        informationPath,
        expectedVariants,
        dryRun = false,
        transactionTimeout = 120_000,
        transactionMaxWait = 60_000
    }: {
        year: number;
        curriculaPath: string;
        informationPath: string;
        expectedVariants?: Map<number, ExpectedVariants>;
        dryRun?: boolean;
        transactionTimeout?: number;
        transactionMaxWait?: number;
    }
) {
    const expected =
        expectedVariants ??
        (await expectedCatalogProgramVariants({
            year,
            curriculaPath,
            informationPath
        }));
    const catalogPrograms = await prisma.catalogProgram.findMany({
        where: {
            catalog: { year },
            program: { code: { in: [...expected.keys()] } }
        },
        select: { id: true, program: { select: { code: true } } }
    });
    const persistedCodes = new Set(
        catalogPrograms.map(({ program }) => program.code)
    );
    const missingPrograms = [...expected.keys()].filter(
        (code) => !persistedCodes.has(code)
    );
    if (missingPrograms.length > 0)
        throw new Error(
            `[${year}] CatalogProgram ausente para os programas ${missingPrograms.join(", ")}`
        );

    let removedVariants = 0;
    let candidateSpecializations = 0;
    for (const catalogProgram of catalogPrograms) {
        const plan = await withAuditTransaction(
            prisma,
            auditContext,
            (tx) =>
                reconcileProgram(
                    tx,
                    catalogProgram.id,
                    expected.get(catalogProgram.program.code)!,
                    dryRun
                ),
            { timeout: transactionTimeout, maxWait: transactionMaxWait }
        );
        if (plan.staleVariantIds.length > 0)
            logger.info(
                JSON.stringify({
                    year,
                    programCode: catalogProgram.program.code,
                    staleVariantIds: plan.staleVariantIds,
                    staleSpecializationIds: plan.staleSpecializationIds,
                    dryRun
                })
            );
        removedVariants += plan.staleVariantIds.length;
        candidateSpecializations += plan.staleSpecializationIds.length;
    }
    logger.info(
        JSON.stringify({
            year,
            reconciledPrograms: catalogPrograms.length,
            removedVariants,
            candidateSpecializations,
            dryRun
        })
    );
}
