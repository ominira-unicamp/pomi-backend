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
    };
    request: EndpointRequestSchema;
    response: EndpointResponsesSchema;
};

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
