import type { PrismaClient } from "@pomi/db";
import { readFile } from "node:fs/promises";
import { withAuditTransaction } from "../audit-context.js";
import type { InjectionContext } from "./InjectionTypes.js";
import {
    historicalProgramUnits,
    type HistoricalProgramUnit
} from "./historical-program-units.js";
import { unwrapScrapeData } from "./scrape-input.js";

export type HistoricalProgramsInjectionOptions = {
    transactionTimeout?: number;
    transactionMaxWait?: number;
};

type HistoricalProgram = {
    code: number;
    name: string;
    sourceUrl: string;
};

type HistoricalCatalog = {
    year: number;
    sourceUrl: string;
    programs: HistoricalProgram[];
};

export type HistoricalProgramImport = {
    code: number;
    name: string;
    unitCode: string;
    unitId: number;
    sourceUrl: string;
    catalogYears: number[];
};

export class HistoricalProgramsValidationError extends Error {}

export function normalizeHistoricalProgramCatalogs(
    value: unknown
): HistoricalCatalog[] {
    const data = unwrapScrapeData(value) as {
        catalogs?: unknown;
    };
    if (!data || !Array.isArray(data.catalogs))
        throw new HistoricalProgramsValidationError(
            "O arquivo histórico deve conter data.catalogs"
        );
    return data.catalogs.map((rawCatalog) => {
        const catalog = rawCatalog as {
            year?: unknown;
            sourceUrl?: unknown;
            programs?: unknown;
        };
        if (!Number.isInteger(catalog.year) || !Array.isArray(catalog.programs))
            throw new HistoricalProgramsValidationError(
                "Catálogo histórico em formato inválido"
            );
        const year = catalog.year as number;
        return {
            year,
            sourceUrl:
                typeof catalog.sourceUrl === "string" ? catalog.sourceUrl : "",
            programs: catalog.programs.map((rawProgram) => {
                const program = rawProgram as {
                    code?: unknown;
                    name?: unknown;
                    sourceUrl?: unknown;
                };
                if (
                    !Number.isInteger(program.code) ||
                    typeof program.name !== "string" ||
                    program.name.trim().length === 0 ||
                    typeof program.sourceUrl !== "string"
                )
                    throw new HistoricalProgramsValidationError(
                        `Programa histórico inválido no catálogo ${year}`
                    );
                return {
                    code: program.code as number,
                    name: program.name.trim(),
                    sourceUrl: program.sourceUrl
                };
            })
        };
    });
}

export function createHistoricalProgramImportPlan({
    catalogs,
    existingProgramCodes,
    units,
    unitMappings = historicalProgramUnits
}: {
    catalogs: HistoricalCatalog[];
    existingProgramCodes: number[];
    units: Array<{ id: number; code: string }>;
    unitMappings?: HistoricalProgramUnit[];
}): HistoricalProgramImport[] {
    const existing = new Set(existingProgramCodes);
    const occurrences = new Map<
        number,
        Array<{ year: number; program: HistoricalProgram }>
    >();
    for (const catalog of catalogs)
        for (const program of catalog.programs) {
            const values = occurrences.get(program.code) ?? [];
            values.push({ year: catalog.year, program });
            occurrences.set(program.code, values);
        }
    const mappings = new Map(
        unitMappings.map((mapping) => [mapping.programCode, mapping])
    );
    if (mappings.size !== unitMappings.length)
        throw new HistoricalProgramsValidationError(
            "O mapa de unidades históricas possui códigos duplicados"
        );
    const required = [...mappings.keys()]
        .filter((code) => !existing.has(code))
        .sort((left, right) => left - right);
    const unitsByCode = new Map(units.map((unit) => [unit.code, unit.id]));
    const missingSources = required.filter(
        (code) =>
            !occurrences
                .get(code)
                ?.some(({ program }) => program.sourceUrl.trim().length > 0)
    );
    const missingUnits = required.filter((code) => {
        const mapping = mappings.get(code);
        return mapping ? !unitsByCode.has(mapping.unitCode) : false;
    });
    const missingUnitSources = required.filter((code) => {
        const mapping = mappings.get(code);
        return mapping ? mapping.sourceUrl.trim().length === 0 : false;
    });
    if (
        missingSources.length > 0 ||
        missingUnits.length > 0 ||
        missingUnitSources.length > 0
    )
        throw new HistoricalProgramsValidationError(
            [
                missingSources.length > 0
                    ? `sem fonte histórica: ${missingSources.join(", ")}`
                    : "",
                missingUnits.length > 0
                    ? `com unidade inexistente: ${missingUnits.join(", ")}`
                    : "",
                missingUnitSources.length > 0
                    ? `sem fonte do mapeamento de unidade: ${missingUnitSources.join(", ")}`
                    : ""
            ]
                .filter(Boolean)
                .join("; ")
        );
    return required.map((code) => {
        const values = occurrences
            .get(code)!
            .filter(({ program }) => program.sourceUrl.trim().length > 0);
        const latest = [...values].sort(
            (left, right) => right.year - left.year
        )[0];
        const mapping = mappings.get(code)!;
        return {
            code,
            name: latest.program.name,
            unitCode: mapping.unitCode,
            unitId: unitsByCode.get(mapping.unitCode)!,
            sourceUrl: latest.program.sourceUrl,
            catalogYears: [...new Set(values.map(({ year }) => year))].sort(
                (left, right) => left - right
            )
        };
    });
}

type TransactionClient = Omit<
    PrismaClient,
    "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

async function persistHistoricalPrograms(
    tx: TransactionClient,
    imports: HistoricalProgramImport[],
    changes: Parameters<InjectionContext["logger"]["change"]>[0][]
) {
    for (const program of imports) {
        const persisted = await tx.program.create({
            data: {
                code: program.code,
                name: program.name,
                unitId: program.unitId
            },
            select: { id: true }
        });
        changes.push({
            entity: "Program",
            operation: "create",
            key: { id: persisted.id, code: program.code },
            before: null,
            after: {
                code: program.code,
                name: program.name,
                unitId: program.unitId,
                sourceUrl: program.sourceUrl
            }
        });
        for (const year of program.catalogYears) {
            const catalog = await tx.catalog.upsert({
                where: { year },
                create: { year },
                update: {},
                select: { id: true }
            });
            await tx.catalogProgram.upsert({
                where: {
                    catalogId_programId: {
                        catalogId: catalog.id,
                        programId: persisted.id
                    }
                },
                create: {
                    catalogId: catalog.id,
                    programId: persisted.id
                },
                update: {}
            });
        }
    }
}

export async function injectHistoricalPrograms(
    { prisma, inputPath, logger, auditContext }: InjectionContext,
    {
        transactionTimeout = 600_000,
        transactionMaxWait = 60_000
    }: HistoricalProgramsInjectionOptions = {}
) {
    const catalogs = normalizeHistoricalProgramCatalogs(
        JSON.parse(await readFile(inputPath, "utf8"))
    );
    const [programs, units] = await Promise.all([
        prisma.program.findMany({ select: { code: true } }),
        prisma.unit.findMany({ select: { id: true, code: true } })
    ]);
    const imports = createHistoricalProgramImportPlan({
        catalogs,
        existingProgramCodes: programs.map(({ code }) => code),
        units
    });
    if (imports.length === 0) {
        logger.info("Nenhum programa histórico ausente.");
        return;
    }
    const changes = [] as Parameters<InjectionContext["logger"]["change"]>[0][];
    await withAuditTransaction(
        prisma,
        auditContext,
        (tx) => persistHistoricalPrograms(tx, imports, changes),
        { timeout: transactionTimeout, maxWait: transactionMaxWait }
    );
    for (const change of changes) logger.change(change);
    logger.info(
        `Programas históricos criados: ${imports.map(({ code }) => code).join(", ")}.`
    );
}
