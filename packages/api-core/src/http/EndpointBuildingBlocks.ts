import z from "zod";

import type { PaginationPolicy } from "../pagination.js";
import {
    createPaginationQuerySchema,
    getPaginatedSchema
} from "../pagination.js";
import { pathSeg, type PathSegment } from "../PathSegment.js";
import { resourceSortSchema, type SortDefinition } from "../sorting.js";
import { ResponseSchemaBuilder } from "./ApiResponse.js";
import type {
    EndpointContract,
    EndpointRequestSchema,
    EndpointResponsesSchema,
    HttpMethod,
    SdkOperationAction,
    SdkOperationMetadata
} from "./EndpointContract.js";

export function defineEndpoint<
    Authorization,
    const Contract extends EndpointContract<Authorization>
>(contract: Contract): Contract {
    return contract;
}

export function request<const Shape extends z.ZodRawShape>(shape: Shape) {
    return z.object(shape);
}

function paginatedQueryWithFilter<
    Shape extends z.ZodRawShape,
    Filter extends z.ZodType
>(policy: PaginationPolicy, filter: Filter, additional?: Shape) {
    return createPaginationQuerySchema(policy, {
        filter: filter.optional(),
        ...(additional ?? ({} as Shape))
    });
}

function paginatedQuery<Shape extends z.ZodRawShape>(
    policy: PaginationPolicy,
    additional?: Shape
) {
    return createPaginationQuerySchema(policy, additional);
}

function filteredQuery<Shape extends z.ZodRawShape, Filter extends z.ZodType>(
    filter: Filter,
    additional?: Shape
) {
    return z.object({
        filter: filter.optional(),
        ...(additional ?? ({} as Shape))
    });
}

export function collectionQuery<
    Shape extends z.ZodRawShape,
    Filter extends z.ZodType
>(options: {
    pagination: PaginationPolicy;
    filter: Filter;
    sort: SortDefinition;
    additional?: Shape;
}): ReturnType<
    typeof paginatedQueryWithFilter<
        Shape & {
            sort: z.ZodOptional<ReturnType<typeof resourceSortSchema>>;
        },
        Filter
    >
>;
export function collectionQuery<Shape extends z.ZodRawShape>(options: {
    pagination: PaginationPolicy;
    sort: SortDefinition;
    additional?: Shape;
}): ReturnType<
    typeof paginatedQuery<
        Shape & {
            sort: z.ZodOptional<ReturnType<typeof resourceSortSchema>>;
        }
    >
>;
export function collectionQuery<
    Shape extends z.ZodRawShape,
    Filter extends z.ZodType
>(options: {
    filter: Filter;
    sort: SortDefinition;
    additional?: Shape;
}): ReturnType<
    typeof filteredQuery<
        Shape & {
            sort: z.ZodOptional<ReturnType<typeof resourceSortSchema>>;
        },
        Filter
    >
>;
export function collectionQuery<Shape extends z.ZodRawShape>(options: {
    sort: SortDefinition;
    additional?: Shape;
}): z.ZodObject<
    Shape & { sort: z.ZodOptional<ReturnType<typeof resourceSortSchema>> }
>;
export function collectionQuery<
    Shape extends z.ZodRawShape,
    Filter extends z.ZodType
>(options: {
    pagination: PaginationPolicy;
    filter: Filter;
    additional?: Shape;
}): ReturnType<typeof paginatedQueryWithFilter<Shape, Filter>>;
export function collectionQuery<Shape extends z.ZodRawShape>(options: {
    pagination: PaginationPolicy;
    additional?: Shape;
}): ReturnType<typeof paginatedQuery<Shape>>;
export function collectionQuery<
    Shape extends z.ZodRawShape,
    Filter extends z.ZodType
>(options: {
    filter: Filter;
    additional?: Shape;
}): ReturnType<typeof filteredQuery<Shape, Filter>>;
export function collectionQuery<Shape extends z.ZodRawShape>(options: {
    additional?: Shape;
}): z.ZodObject<Shape>;
export function collectionQuery<
    Shape extends z.ZodRawShape,
    Filter extends z.ZodType
>(options: {
    pagination?: PaginationPolicy;
    filter?: Filter;
    sort?: SortDefinition;
    additional?: Shape;
}) {
    const additional = {
        ...(options.sort
            ? {
                  sort: resourceSortSchema(options.sort).optional()
              }
            : {}),
        ...(options.additional ?? ({} as Shape))
    };
    if (options.pagination && options.filter) {
        return paginatedQueryWithFilter(
            options.pagination,
            options.filter,
            additional
        );
    }
    if (options.pagination) {
        return paginatedQuery(options.pagination, additional);
    }
    if (options.filter) {
        return filteredQuery(options.filter, additional);
    }
    const shape = {
        ...additional
    };
    return z.object(shape);
}

export const paginated = getPaginatedSchema;
export const responses = () => new ResponseSchemaBuilder();

type ResourceSdk = {
    resource: string;
    pathParameters?: Record<string, string>;
};

type ResourceDefinition = {
    collectionPath: PathSegment[];
    memberParameter: string;
    tag: string;
    operationName: string;
    sdk: ResourceSdk;
};

type OperationSdkOverride = false | Partial<SdkOperationMetadata> | undefined;

type OperationOptions<
    Authorization,
    Request extends EndpointRequestSchema,
    Response extends EndpointResponsesSchema
> = {
    authorization: Authorization;
    request: Request;
    response: Response;
    operationId?: string;
    sdk?: OperationSdkOverride;
    summary?: string;
    description?: string;
    deprecated?: boolean;
};

type ListOptions<
    Authorization,
    Item extends z.ZodType,
    Request extends EndpointRequestSchema,
    Response extends EndpointResponsesSchema | undefined
> = {
    authorization: Authorization;
    item: Item;
    pagination: PaginationPolicy;
    request: Request;
    response?: Response;
    responseDescription?: string;
    operationId?: string;
    sdk?: OperationSdkOverride;
    summary?: string;
    description?: string;
    deprecated?: boolean;
};

function operationMetadata(
    definition: ResourceDefinition,
    action: SdkOperationAction,
    path: PathSegment[],
    operationId: string | undefined,
    sdkOverride: OperationSdkOverride
): { operationId: string; sdk: SdkOperationMetadata | false } {
    const pathParameters = Object.fromEntries(
        Object.entries(definition.sdk.pathParameters ?? {}).filter(([name]) =>
            path.some(
                (segment) => segment.type === "param" && segment.name === name
            )
        )
    );
    const defaultSdk: SdkOperationMetadata = {
        resource: definition.sdk.resource,
        action,
        method: action,
        ...(Object.keys(pathParameters).length > 0 ? { pathParameters } : {})
    };
    return {
        operationId: operationId ?? `${action}${definition.operationName}`,
        sdk:
            sdkOverride === false
                ? false
                : { ...defaultSdk, ...(sdkOverride ?? {}) }
    };
}

export function defineResource(definition: ResourceDefinition) {
    const memberPath = definition.collectionPath.concat(
        pathSeg.param(definition.memberParameter)
    );

    function operation<
        Authorization,
        Request extends EndpointRequestSchema,
        Response extends EndpointResponsesSchema
    >(
        method: HttpMethod,
        path: PathSegment[],
        action: SdkOperationAction,
        options: OperationOptions<Authorization, Request, Response>
    ) {
        return defineEndpoint({
            meta: {
                method,
                path,
                tags: [definition.tag],
                authorization: options.authorization,
                ...operationMetadata(
                    definition,
                    action,
                    path,
                    options.operationId,
                    options.sdk
                ),
                ...(options.summary ? { summary: options.summary } : {}),
                ...(options.description
                    ? { description: options.description }
                    : {}),
                ...(options.deprecated !== undefined
                    ? { deprecated: options.deprecated }
                    : {})
            },
            request: options.request,
            response: options.response
        });
    }

    return {
        collectionPath: definition.collectionPath,
        memberPath,
        get: <
            Authorization,
            Request extends EndpointRequestSchema,
            Response extends EndpointResponsesSchema
        >(
            options: OperationOptions<Authorization, Request, Response>
        ) => operation("get", memberPath, "get", options),
        list: <
            Authorization,
            Item extends z.ZodType,
            Request extends EndpointRequestSchema,
            Response extends EndpointResponsesSchema | undefined = undefined
        >(
            options: ListOptions<Authorization, Item, Request, Response>
        ) => {
            const query = options.request.shape.query;
            const filter =
                query && "shape" in query
                    ? Object.hasOwn(query.shape as object, "filter")
                    : false;
            const sort =
                query && "shape" in query
                    ? Object.hasOwn(query.shape as object, "sort")
                    : false;
            const endpointResponse =
                options.response ??
                responses()
                    .ok(
                        paginated(options.item),
                        options.responseDescription ??
                            `List of ${definition.operationName} retrieved successfully`
                    )
                    .build();
            return defineEndpoint({
                meta: {
                    method: "get",
                    path: definition.collectionPath,
                    tags: [definition.tag],
                    authorization: options.authorization,
                    queryFeatures: {
                        filter,
                        ...(sort ? { sort: true } : {})
                    },
                    pagination: options.pagination,
                    ...operationMetadata(
                        definition,
                        "list",
                        definition.collectionPath,
                        options.operationId,
                        options.sdk
                    ),
                    ...(options.summary ? { summary: options.summary } : {}),
                    ...(options.description
                        ? { description: options.description }
                        : {}),
                    ...(options.deprecated !== undefined
                        ? { deprecated: options.deprecated }
                        : {})
                },
                request: options.request,
                response: endpointResponse
            });
        },
        create: <
            Authorization,
            Request extends EndpointRequestSchema,
            Response extends EndpointResponsesSchema
        >(
            options: OperationOptions<Authorization, Request, Response>
        ) => operation("post", definition.collectionPath, "create", options),
        update: <
            Authorization,
            Request extends EndpointRequestSchema,
            Response extends EndpointResponsesSchema
        >(
            options: OperationOptions<Authorization, Request, Response>
        ) => operation("patch", memberPath, "update", options),
        delete: <
            Authorization,
            Request extends EndpointRequestSchema,
            Response extends EndpointResponsesSchema
        >(
            options: OperationOptions<Authorization, Request, Response>
        ) => operation("delete", memberPath, "delete", options)
    };
}
