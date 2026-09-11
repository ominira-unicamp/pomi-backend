import type { CookieOptions } from "express";
import z from "zod";

import type { PathSegment } from "../PathSegment.js";

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
    pathParameters?: Record<string, string>;
};

export type PaginationMetadata = {
    itemsField: string;
    nextField: string;
    defaultPageSize: number;
    maxPageSize: number;
};

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
    if (!sdk && !pagination) return;

    const pathParameters = new Set(
        contract.meta.path.flatMap((segment) =>
            segment.type === "param" ? [segment.name] : []
        )
    );
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
    if (pagination && sdk?.action !== "list") {
        throw new Error("SDK pagination metadata requires action=list");
    }
    if (
        pagination &&
        (pagination.defaultPageSize < 1 ||
            pagination.maxPageSize < pagination.defaultPageSize)
    ) {
        throw new Error("Invalid SDK pagination limits");
    }
    if (pagination) {
        const success = contract.response.options.find((variant) => {
            const status = variant.shape.status.value;
            return status >= 200 && status < 300;
        });
        const responseBody = success
            ? (success.shape.body as z.ZodOptional<z.ZodType>).unwrap()
            : undefined;
        if (
            !responseBody ||
            !schemaHasPath(responseBody, pagination.itemsField) ||
            !schemaHasPath(responseBody, pagination.nextField)
        ) {
            throw new Error(
                "SDK pagination fields must exist in the successful response"
            );
        }
    }
}

function schemaHasPath(schema: z.ZodType, path: string): boolean {
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
