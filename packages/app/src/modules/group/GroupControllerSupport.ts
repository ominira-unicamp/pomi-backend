import {
    ApiResponse,
    buildArrayPaginationResponse,
    unpaginatedByDefault
} from "@pomi/api-core";
export const page = <T>(
    items: T[],
    query: Parameters<typeof buildArrayPaginationResponse<T>>[1],
    path: string
) =>
    ApiResponse.ok(
        buildArrayPaginationResponse(items, query, unpaginatedByDefault, path)
    );
export const groupId = (query: {
    filter?: { path: string[]; values: (string | number)[] }[];
}) =>
    query.filter?.find((entry) => entry.path.join(".") === "groupId")
        ?.values[0] as number | undefined;
export const profilePublicId = (query: {
    filter?: { path: string[]; values: (string | number)[] }[];
}) =>
    query.filter?.find((entry) => entry.path.join(".") === "publicId")
        ?.values[0] as string | undefined;
