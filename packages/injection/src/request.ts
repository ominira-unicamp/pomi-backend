import { isInjectionName } from "./registry.js";

export type InjectionRequestParameters = {
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
    options: InjectionRequestParameters
): {
    partitionKey?: string;
    parameters: Record<string, unknown>;
} {
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
