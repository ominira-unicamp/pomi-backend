import z from "zod";

import { serializeQueryParams } from "./queryFilter.js";

export type PaginationPolicy = {
    defaultMode: "page" | "all";
    defaultPageSize: number;
    maxPageSize?: number;
    allowAll: boolean;
};

export type PaginationQuery = {
    page?: number;
    pageSize?: number | "all";
};

export type ResolvedPagination =
    | { mode: "all" }
    | {
          mode: "page";
          page: number;
          pageSize: number;
          skip: number;
          take: number;
      };

export type PaginationLinkQuery =
    | { page: number; pageSize: number }
    | { pageSize: "all" };

export const unpaginatedByDefault = {
    defaultMode: "all",
    defaultPageSize: 20,
    allowAll: true
} satisfies PaginationPolicy;

export const paginatedByDefault = {
    defaultMode: "page",
    defaultPageSize: 20,
    allowAll: false
} satisfies PaginationPolicy;

export function createPaginationQuerySchema<
    Shape extends z.ZodRawShape = Record<never, never>
>(policy: PaginationPolicy, shape?: Shape) {
    assertPaginationPolicy(policy);
    let numericPageSize = z.coerce.number().int().min(1);
    if (policy.maxPageSize !== undefined) {
        numericPageSize = numericPageSize.max(policy.maxPageSize);
    }
    const pageSize = policy.allowAll
        ? z.union([numericPageSize, z.literal("all")])
        : numericPageSize;
    return z
        .object({
            page: z.coerce.number().int().min(1).optional().openapi({
                description: "Page number. The first page is 1."
            }),
            pageSize: pageSize.optional().openapi({
                description: policy.allowAll
                    ? 'Number of items per page, or "all" to return every item.'
                    : "Number of items per page."
            }),
            ...(shape ?? ({} as Shape))
        })
        .superRefine((query, context) => {
            const pagination = query as PaginationQuery;
            if (
                pagination.pageSize === "all" &&
                pagination.page !== undefined
            ) {
                context.addIssue({
                    code: "custom",
                    path: ["page"],
                    message: 'page cannot be combined with pageSize="all"'
                });
            }
        });
}

export const paginationQuerySchema = z.object({
    page: z.coerce.number().int().min(1).optional().default(1).openapi({
        description: "Page number. The first page is 1."
    }),
    pageSize: z.coerce.number().int().min(1).optional().default(20).openapi({
        description: "Number of items per page."
    })
});

export type PaginationQueryType = {
    page: number;
    pageSize: number;
};

export function resolvePagination(
    query: PaginationQuery,
    policy: PaginationPolicy
): ResolvedPagination {
    assertPaginationPolicy(policy);
    if (
        (query.page !== undefined &&
            (!Number.isInteger(query.page) || query.page < 1)) ||
        (typeof query.pageSize === "number" &&
            (!Number.isInteger(query.pageSize) || query.pageSize < 1))
    ) {
        throw new Error("Invalid pagination query");
    }
    if (query.pageSize === "all") {
        if (!policy.allowAll || query.page !== undefined) {
            throw new Error("Invalid pagination query");
        }
        return { mode: "all" };
    }
    if (
        query.page === undefined &&
        query.pageSize === undefined &&
        policy.defaultMode === "all"
    ) {
        return { mode: "all" };
    }
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? policy.defaultPageSize;
    if (policy.maxPageSize !== undefined && pageSize > policy.maxPageSize) {
        throw new Error("Invalid pagination query");
    }
    return {
        mode: "page",
        page,
        pageSize,
        skip: (page - 1) * pageSize,
        take: pageSize
    };
}

export function prismaPaginationParams(pagination: ResolvedPagination): {
    skip?: number;
    take?: number;
} {
    return pagination.mode === "page"
        ? { skip: pagination.skip, take: pagination.take }
        : {};
}

export function prismaPaginationParamsFromQuery(query: {
    page: number;
    pageSize: number;
}) {
    return {
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
    };
}

export function paginateItems<T>(items: T[], pagination: ResolvedPagination) {
    return pagination.mode === "page"
        ? items.slice(pagination.skip, pagination.skip + pagination.take)
        : items;
}

export function buildArrayPaginationResponse<T>(
    items: T[],
    query: PaginationQuery & Record<string, unknown>,
    policy: PaginationPolicy,
    path: string
) {
    const pagination = resolvePagination(query, policy);
    return buildPaginationResponse<z.ZodType<T>>(
        paginateItems(items, pagination) as z.output<z.ZodType<T>>[],
        items.length,
        pagination,
        (linkQuery) => buildPaginationPath(path, query, linkQuery)
    );
}

export function buildPaginationPath(
    path: string,
    query: Record<string, unknown>,
    pagination: PaginationLinkQuery
) {
    const search = serializeQueryParams({ ...query, ...pagination });
    return `${path}${search ? `?${search}` : ""}`;
}

export function getPaginatedSchema<T extends z.ZodType>(dataSchema: T) {
    return z.object({
        data: z.array(dataSchema),
        quantity: z.number().int(),
        total: z.number().int(),
        _paths: z.object({
            firstPage: z.string(),
            lastPage: z.string(),
            next: z.string().nullable(),
            prev: z.string().nullable()
        })
    });
}

export type PaginatedSchemaType<T extends z.ZodType> = ReturnType<
    typeof getPaginatedSchema<T>
>;
export type PaginatedResult<T extends z.ZodType> = z.infer<
    ReturnType<typeof getPaginatedSchema<T>>
>;

export function buildPaginationResponse<T extends z.ZodType>(
    items: z.infer<T>[],
    totalItems: number,
    pagination: { page: number; pageSize: number },
    buildPath: (page: number) => string
): PaginatedResult<T>;
export function buildPaginationResponse<T extends z.ZodType>(
    items: z.infer<T>[],
    totalItems: number,
    pagination: ResolvedPagination,
    buildPath: (query: PaginationLinkQuery) => string
): PaginatedResult<T>;
export function buildPaginationResponse<T extends z.ZodType>(
    items: z.infer<T>[],
    totalItems: number,
    pagination: ResolvedPagination | { page: number; pageSize: number },
    buildPath:
        | ((query: PaginationLinkQuery) => string)
        | ((page: number) => string)
): PaginatedResult<T> {
    let resolved: ResolvedPagination;
    let linkPath: (query: PaginationLinkQuery) => string;
    if ("mode" in pagination) {
        resolved = pagination;
        linkPath = buildPath as (query: PaginationLinkQuery) => string;
    } else {
        resolved = {
            mode: "page",
            page: pagination.page,
            pageSize: pagination.pageSize,
            skip: (pagination.page - 1) * pagination.pageSize,
            take: pagination.pageSize
        };
        linkPath = (query) =>
            (buildPath as (page: number) => string)(
                "page" in query ? query.page : 1
            );
    }
    if (resolved.mode === "all") {
        const path = linkPath({ pageSize: "all" });
        return {
            data: items,
            quantity: items.length,
            total: totalItems,
            _paths: {
                firstPage: path,
                lastPage: path,
                next: null,
                prev: null
            }
        };
    }
    const totalPages = Math.max(1, Math.ceil(totalItems / resolved.pageSize));
    const path = (page: number) =>
        linkPath({ page, pageSize: resolved.pageSize });
    return {
        data: items,
        quantity: items.length,
        total: totalItems,
        _paths: {
            firstPage: path(1),
            lastPage: path(totalPages),
            next: resolved.page < totalPages ? path(resolved.page + 1) : null,
            prev: resolved.page > 1 ? path(resolved.page - 1) : null
        }
    };
}

function assertPaginationPolicy(policy: PaginationPolicy) {
    if (
        !Number.isInteger(policy.defaultPageSize) ||
        policy.defaultPageSize < 1 ||
        (policy.maxPageSize !== undefined &&
            (!Number.isInteger(policy.maxPageSize) ||
                policy.maxPageSize < policy.defaultPageSize)) ||
        (policy.defaultMode === "all" && !policy.allowAll)
    ) {
        throw new Error("Invalid pagination policy");
    }
}
