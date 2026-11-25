import { isInjectionName } from "./registry.js";

export type InjectionRequestParameters = {
    year?: number;
    firstYear?: number;
    lastYear?: number;
    partitionKey?: string;
    instituteCode?: string;
    semester?: 1 | 2;
    firstSemester?: 1 | 2;
    lastSemester?: 1 | 2;
    snapshotId?: string;
};

export function isRequestableInjection(name: string): boolean {
    return isInjectionName(name);
}

export function injectionRequestPartition(
    options: InjectionRequestParameters,
    name?: string,
    now = new Date()
): {
    partitionKey?: string;
    parameters: Record<string, unknown>;
} {
    if (name === "catalog-disciplines-snapshot") {
        const parameters = annualInjectionParameters({ ...options }, now);
        return { partitionKey: String(parameters.year), parameters };
    }
    if (name === "academic-data" || name === "academic-data-snapshot") {
        const selected =
            options.year !== undefined ||
            options.firstYear !== undefined ||
            options.lastYear !== undefined;
        if (selected) {
            const periods = academicPeriods(options);
            if (options.partitionKey || options.snapshotId)
                throw new Error(
                    "Seleção de períodos não aceita --partition-key ou --snapshot-id"
                );
            return {
                parameters: {
                    root: true,
                    periods,
                    ...(options.instituteCode
                        ? { instituteCode: options.instituteCode }
                        : {})
                }
            };
        }
        if (
            options.semester !== undefined ||
            options.firstSemester !== undefined ||
            options.lastSemester !== undefined
        )
            throw new Error("Informe o ano ou os limites do intervalo");
    } else if (
        options.firstSemester !== undefined ||
        options.lastSemester !== undefined
    ) {
        throw new Error("Limites de semestre são exclusivos de academic-data");
    }
    if (options.year !== undefined)
        throw new Error("--year não é suportado por esta injection");
    const firstYear = options.firstYear ?? options.lastYear;
    const lastYear = options.lastYear ?? options.firstYear;
    const partitionKey =
        options.partitionKey ??
        options.instituteCode ??
        (firstYear === undefined || lastYear === undefined
            ? undefined
            : `${firstYear}-${lastYear}`);
    const parameters = {
        ...(partitionKey === undefined ? {} : { partitionKey }),
        ...(firstYear === undefined ? {} : { firstYear }),
        ...(lastYear === undefined ? {} : { lastYear }),
        ...(options.instituteCode === undefined
            ? {}
            : { instituteCode: options.instituteCode }),
        ...(options.semester === undefined
            ? {}
            : { semester: options.semester }),
        ...(options.snapshotId === undefined
            ? {}
            : { snapshotId: options.snapshotId })
    };
    return {
        ...(partitionKey === undefined ? {} : { partitionKey }),
        parameters:
            Object.keys(parameters).length === 0 ? { root: true } : parameters
    };
}

export function annualInjectionParameters(
    parameters: Record<string, unknown>,
    now = new Date()
): Record<string, unknown> & { year: number; partitionKey: string } {
    const years = [
        parameters.year,
        parameters.firstYear,
        parameters.lastYear
    ].filter((value) => value !== undefined);
    if (
        years.some(
            (value) =>
                typeof value !== "number" ||
                !Number.isInteger(value) ||
                value < 1900 ||
                value > 3000
        )
    )
        throw new Error("Ano inválido");
    const year = (years[0] as number | undefined) ?? now.getFullYear();
    if (years.some((value) => value !== year))
        throw new Error(
            "A injection anual requer um único ano; parâmetros conflitantes ou intervalos não são suportados"
        );
    if (
        parameters.partitionKey !== undefined &&
        parameters.partitionKey !== String(year)
    )
        throw new Error(
            "Partição do snapshot não corresponde ao ano solicitado"
        );
    const rest = { ...parameters };
    delete rest.root;
    return { ...rest, year, partitionKey: String(year) };
}

export function academicPeriods(
    options: InjectionRequestParameters
): Array<{ year: number; semester: 1 | 2 }> {
    if (
        options.year !== undefined &&
        (options.firstYear !== undefined || options.lastYear !== undefined)
    )
        throw new Error("Use --year ou --first-year/--last-year");
    if (
        options.semester !== undefined &&
        (options.firstSemester !== undefined ||
            options.lastSemester !== undefined)
    )
        throw new Error("Use --semester ou --first-semester/--last-semester");
    const firstYear = options.year ?? options.firstYear ?? options.lastYear;
    const lastYear = options.year ?? options.lastYear ?? options.firstYear;
    if (
        firstYear === undefined ||
        lastYear === undefined ||
        [firstYear, lastYear].some(
            (year) => !Number.isInteger(year) || year < 1900 || year > 3000
        )
    )
        throw new Error("Ano inválido");
    const firstSemester = options.firstSemester ?? options.semester ?? 1;
    const lastSemester = options.lastSemester ?? options.semester ?? 2;
    if (![1, 2].includes(firstSemester) || ![1, 2].includes(lastSemester))
        throw new Error("Semestre inválido");
    const start = firstYear * 2 + firstSemester - 1;
    const end = lastYear * 2 + lastSemester - 1;
    if (start > end) throw new Error("Intervalo de semestres invertido");
    return Array.from({ length: end - start + 1 }, (_, index) => {
        const value = start + index;
        return {
            year: Math.floor(value / 2),
            semester: ((value % 2) + 1) as 1 | 2
        };
    }).filter(
        (period) =>
            options.semester === undefined ||
            period.semester === options.semester
    );
}

export async function academicRequestPartitions(
    selection: Record<string, unknown>,
    discoverInstitutes: (year: number, semester: 1 | 2) => Promise<string[]>
) {
    const partitions: Array<{
        key: string;
        parameters: Record<string, unknown>;
    }> = [];
    for (const period of selection.periods as Array<{
        year: number;
        semester: 1 | 2;
    }>) {
        const codes =
            typeof selection.instituteCode === "string"
                ? [selection.instituteCode]
                : await discoverInstitutes(period.year, period.semester);
        if (codes.length === 0)
            throw new Error(
                `Nenhum instituto para ${period.year}/${period.semester}`
            );
        for (const instituteCode of codes) {
            const key = `${period.year}-${period.semester}-${instituteCode}`;
            partitions.push({
                key,
                parameters: { ...period, instituteCode, partitionKey: key }
            });
        }
    }
    return partitions;
}
