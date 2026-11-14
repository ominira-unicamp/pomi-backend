import { isInjectionName } from "./registry.js";

export type InjectionRequestParameters = {
    year?: number;
    firstYear?: number;
    lastYear?: number;
    partitionKey?: string;
    instituteCode?: string;
    semester?: 1 | 2;
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
