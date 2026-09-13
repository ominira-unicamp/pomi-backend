import type { CookieOptions } from "express";
import z from "zod";

import type { PathSegment } from "../PathSegment.js";
import type { PaginationPolicy } from "../pagination.js";

export const HttpMethods = {
    GET: "get",
    POST: "post",
    PUT: "put",
    PATCH: "patch",
    DELETE: "delete"
} as const;

export type HttpMethod = (typeof HttpMethods)[keyof typeof HttpMethods];

export type EndpointRequestSchema = z.ZodObject<{
    path?: z.ZodType;
    query?: z.ZodType;
    body?: z.ZodType;
    headers?: z.ZodType;
}>;

export const responseEffectSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("set-cookie"),
        name: z.string(),
        value: z.string(),
        options: z.custom<CookieOptions>()
    }),
    z.object({
        type: z.literal("clear-cookie"),
        name: z.string(),
        options: z.custom<CookieOptions>()
    })
]);

export type ResponseEffect = z.infer<typeof responseEffectSchema>;

export type ResponseVariant = z.ZodObject<{
    status: z.ZodLiteral<number>;
    body: z.ZodType;
    effects: z.ZodOptional<z.ZodArray<typeof responseEffectSchema>>;
}>;

export type EndpointResponsesSchema = z.ZodDiscriminatedUnion<
    [ResponseVariant, ...ResponseVariant[]],
    "status"
>;

export type SdkOperationAction =
    | "list"
    | "get"
    | "create"
    | "update"
    | "delete";

export type SdkOperationMetadata = {
    resource: string;
    action: SdkOperationAction;
    method?: string;
    pathParameters?: Record<string, string>;
};

export type SdkSchemaMetadata = {
    kind?:
        | "entity"
        | "value-object"
        | "projection"
        | "input"
        | "page"
        | "problem"
        | "transport";
    publicName?: string;
    transportFields?: string[];
};

export type PaginationMetadata = PaginationPolicy;

export type EndpointContract<Authorization = unknown> = {
    meta: {
        operationId?: string;
        summary?: string;
        description?: string;
        deprecated?: boolean;
        method: HttpMethod;
        path: PathSegment[];
        tags: string[];
        authorization: Authorization;
        queryFeatures?: {
            filter?: boolean;
        };
        sdk?: SdkOperationMetadata;
        pagination?: PaginationMetadata;
    };
    request: EndpointRequestSchema;
    response: EndpointResponsesSchema;
};

export function assertSdkMetadataConsistency(
    contract: EndpointContract<unknown>
) {
    const sdk = contract.meta.sdk;
    const pagination = contract.meta.pagination;
    const responseBody = getSuccessfulResponseBody(contract);
    const hasPaginationEnvelope =
        responseBody !== undefined &&
        schemaHasPath(responseBody, "data") &&
        schemaHasPath(responseBody, "quantity") &&
        schemaHasPath(responseBody, "total") &&
        schemaHasPath(responseBody, "_paths.next");

    if (responseBody instanceof z.ZodArray) {
        throw new Error(
            "Collection endpoints must use the standard pagination envelope"
        );
    }
    if (hasPaginationEnvelope && !pagination) {
        throw new Error("Paginated responses must declare a pagination policy");
    }
    if (!sdk && !pagination) return;

    const pathParameters = new Set(
        contract.meta.path.flatMap((segment) =>
            segment.type === "param" ? [segment.name] : []
        )
    );
    if (
        sdk?.method !== undefined &&
        !/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(sdk.method)
    ) {
        throw new Error(`Invalid SDK method "${sdk.method}"`);
    }
    for (const parameter of Object.keys(sdk?.pathParameters ?? {})) {
        if (!pathParameters.has(parameter)) {
            throw new Error(
                `SDK path parameter "${parameter}" does not exist in ${contract.meta.method.toUpperCase()} ${contract.meta.path
                    .map((segment) =>
                        segment.type === "literal"
                            ? segment.value
                            : `:${segment.name}`
                    )
                    .join("/")}`
            );
        }
    }
    if (pagination && sdk && sdk.action !== "list") {
        throw new Error("SDK pagination metadata requires action=list");
    }
    if (pagination) {
        if (
            pagination.defaultPageSize < 1 ||
            (pagination.maxPageSize !== undefined &&
                pagination.maxPageSize < pagination.defaultPageSize) ||
            (pagination.defaultMode === "all" && !pagination.allowAll)
        ) {
            throw new Error("Invalid pagination policy");
        }
        const query = contract.request.shape.query;
        if (
            !(query instanceof z.ZodObject) ||
            !Object.hasOwn(query.shape, "page") ||
            !Object.hasOwn(query.shape, "pageSize")
        ) {
            throw new Error(
                "Paginated endpoints must define page and pageSize query parameters"
            );
        }
        if (!hasPaginationEnvelope) {
            throw new Error(
                "SDK pagination fields must exist in the successful response"
            );
        }
    }
}

function getSuccessfulResponseBody(contract: EndpointContract<unknown>) {
    const success = contract.response.options.find((variant) => {
        const status = variant.shape.status.value;
        return status >= 200 && status < 300;
    });
    if (!success) return undefined;
    const body = success.shape.body;
    return body instanceof z.ZodOptional ? body.unwrap() : body;
}

function schemaHasPath(schema: z.ZodType, path: string | undefined): boolean {
    if (!path) return false;
    let current: unknown = schema;
    for (const part of path.split(".")) {
        if (!(current instanceof z.ZodObject)) return false;
        const child = current.shape[part];
        if (!child) return false;
        current = child;
    }
    return true;
}

export function assertQueryFeatureConsistency(
    contract: EndpointContract<unknown>
) {
    const querySchema = contract.request.shape.query;
    const hasFilterSchema =
        querySchema instanceof z.ZodObject &&
        Object.hasOwn(querySchema.shape, "filter");
    const filterEnabled = contract.meta.queryFeatures?.filter === true;

    if (hasFilterSchema === filterEnabled) return;

    const operation = `${contract.meta.method.toUpperCase()} ${contract.meta.path
        .map((segment) =>
            segment.type === "literal" ? segment.value : `:${segment.name}`
        )
        .join("/")}`;
    const expected = hasFilterSchema
        ? "queryFeatures.filter=true"
        : "nenhum schema de filter na query";
    const actual = hasFilterSchema
        ? "um schema de filter na query"
        : "queryFeatures.filter=true";

    throw new Error(
        `Inconsistent filter capability for ${operation}: expected ${expected}, found ${actual}`
    );
}

export type EndpointRegistry<Authorization = unknown> = Record<
    string,
    EndpointContract<Authorization>
>;
