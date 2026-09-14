import type { CookieOptions } from "express";
import z from "zod";

import {
    ConflictProblemSchema,
    InternalServerErrorProblemSchema,
    InvalidRequestProblemSchema,
    ResourceNotFoundProblemSchema,
    UnauthenticatedProblemSchema,
    UnprocessableEntityProblemSchema
} from "../errors/ProblemDetails.js";
import type { ResponseEffect, ResponseVariant } from "./EndpointContract.js";
import { responseEffectSchema } from "./EndpointContract.js";

function responseSchema<Status extends number, Schema extends z.ZodType>(
    status: Status,
    body: Schema,
    description: string,
    mediaType = status >= 400 ? "application/problem+json" : "application/json"
) {
    return z
        .object({
            status: z.literal(status),
            body,
            effects: z.array(responseEffectSchema).optional()
        })
        .meta({ description, mediaType });
}

function noContentResponseSchema(description: string) {
    return z
        .object({
            status: z.literal(204),
            effects: z.array(responseEffectSchema).optional()
        })
        .meta({ description });
}

export class ResponseSchemaBuilder<Variants extends ResponseVariant[] = []> {
    private readonly variants: ResponseVariant[] = [];

    private add<Variant extends ResponseVariant>(variant: Variant) {
        this.variants.push(variant);
        return this as unknown as ResponseSchemaBuilder<[...Variants, Variant]>;
    }

    ok<Schema extends z.ZodType>(
        schema: Schema,
        description: string,
        options?: { mediaType?: string }
    ) {
        return this.add(
            responseSchema(200, schema, description, options?.mediaType)
        );
    }

    created<Schema extends z.ZodType>(schema: Schema, description: string) {
        return this.add(responseSchema(201, schema, description));
    }

    noContent(description = "No content") {
        return this.add(noContentResponseSchema(description));
    }

    badRequest() {
        return this.add(
            responseSchema(
                400,
                InvalidRequestProblemSchema,
                "Dados da requisição inválidos"
            )
        );
    }

    unauthorized() {
        return this.add(
            responseSchema(
                401,
                UnauthenticatedProblemSchema,
                "Autenticação necessária"
            )
        );
    }

    notFound() {
        return this.add(
            responseSchema(
                404,
                ResourceNotFoundProblemSchema,
                "Recurso não encontrado"
            )
        );
    }

    conflict() {
        return this.add(
            responseSchema(
                409,
                ConflictProblemSchema,
                "Conflito ao concluir a ação"
            )
        );
    }

    unprocessableEntity() {
        return this.add(
            responseSchema(
                422,
                UnprocessableEntityProblemSchema,
                "Não foi possível concluir a ação"
            )
        );
    }

    problem<Status extends number, Schema extends z.ZodType>(
        status: Status,
        schema: Schema,
        description: string
    ) {
        return this.add(responseSchema(status, schema, description));
    }

    internalServerError() {
        return this.add(
            responseSchema(
                500,
                InternalServerErrorProblemSchema,
                "Não foi possível concluir a ação"
            )
        );
    }

    statusCode<Status extends number, Schema extends z.ZodType>(
        status: Status,
        schema: Schema,
        description: string,
        options?: { mediaType?: string }
    ) {
        return this.status(status, schema, description, options);
    }

    status<Status extends number, Schema extends z.ZodType>(
        status: Status,
        schema: Schema,
        description: string,
        options?: { mediaType?: string }
    ) {
        return this.add(
            responseSchema(status, schema, description, options?.mediaType)
        );
    }

    build(): z.ZodDiscriminatedUnion<
        Variants extends [ResponseVariant, ...ResponseVariant[]]
            ? Variants
            : [ResponseVariant, ...ResponseVariant[]],
        "status"
    > {
        if (this.variants.length === 0) {
            throw new Error("At least one response is required");
        }
        return z.discriminatedUnion("status", [
            this.variants[0],
            ...this.variants.slice(1)
        ] as [
            ResponseVariant,
            ...ResponseVariant[]
        ]) as z.ZodDiscriminatedUnion<
            Variants extends [ResponseVariant, ...ResponseVariant[]]
                ? Variants
                : [ResponseVariant, ...ResponseVariant[]],
            "status"
        >;
    }
}

function result<Status extends number, Body>(
    status: Status,
    body: Body,
    effects?: ResponseEffect[]
) {
    return { status, body, ...(effects ? { effects } : {}) };
}

export const ApiResponse = {
    ok: <Body>(body: Body, effects?: ResponseEffect[]) =>
        result(200 as const, body, effects),
    created: <Body>(body: Body, effects?: ResponseEffect[]) =>
        result(201 as const, body, effects),
    noContent: (effects?: ResponseEffect[]) => ({
        status: 204 as const,
        ...(effects ? { effects } : {})
    }),
    status: <Status extends number, Body>(
        status: Status,
        body: Body,
        effects?: ResponseEffect[]
    ) => result(status, body, effects)
};

export const ResponseEffects = {
    setCookie(
        name: string,
        value: string,
        options: CookieOptions
    ): ResponseEffect {
        return { type: "set-cookie", name, value, options };
    },
    clearCookie(name: string, options: CookieOptions): ResponseEffect {
        return { type: "clear-cookie", name, options };
    },
    setHeader(name: string, value: string): ResponseEffect {
        return { type: "set-header", name, value };
    }
};
