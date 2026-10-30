import type { Request, Response } from "express";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type z from "zod";

import {
    invalidRequestProblem,
    withProblemInstance
} from "../errors/ProblemDetails.js";
import { unsupportedQueryFilterField } from "../queryFilter.js";
import { unsupportedQuerySortField } from "../sorting.js";
import { ZodToApiError } from "../Validation.js";
import type {
    EndpointContract,
    EndpointResponsesSchema,
    ResponseEffect
} from "./EndpointContract.js";
import { sendProblem } from "./problemResponse.js";

export type EndpointAction<
    Contract extends EndpointContract<unknown>,
    Context
> = (
    context: Context,
    request: z.infer<Contract["request"]>,
    transport: { request: Request; signal: AbortSignal }
) => Promise<z.infer<Contract["response"]>>;

export function executeEffects(response: Response, effects?: ResponseEffect[]) {
    for (const effect of effects ?? []) {
        if (effect.type === "set-cookie") {
            response.cookie(effect.name, effect.value, effect.options);
        } else {
            if (effect.type === "clear-cookie") {
                response.clearCookie(effect.name, effect.options);
            } else {
                response.setHeader(effect.name, effect.value);
            }
        }
    }
}

export function buildEndpointHandler<
    Authorization,
    Contract extends EndpointContract<Authorization>,
    Context
>(
    contract: Contract,
    action: EndpointAction<Contract, Context>,
    createContext: (request: Request, response: Response) => Context
) {
    return async function endpointHandler(
        request: Request,
        response: Response
    ) {
        const unsupportedFilter = unsupportedQueryFilterField(
            request.query,
            contract.meta.queryFeatures
        );
        if (unsupportedFilter) {
            return sendProblem(
                response,
                invalidRequestProblem([unsupportedFilter], request.path)
            );
        }
        const unsupportedSort = unsupportedQuerySortField(
            request.query,
            contract.meta.queryFeatures
        );
        if (unsupportedSort) {
            return sendProblem(
                response,
                invalidRequestProblem([unsupportedSort], request.path)
            );
        }
        const parsed = contract.request.safeParse({
            query: request.query,
            path: request.params,
            body: request.body,
            headers: request.headers
        });
        if (!parsed.success) {
            return sendProblem(
                response,
                invalidRequestProblem(
                    ZodToApiError(parsed.error, []),
                    request.path
                )
            );
        }

        const controller = new AbortController();
        const abort = () => controller.abort();
        const close = () => {
            if (!response.writableEnded) controller.abort();
        };
        request.once("aborted", abort);
        response.once("close", close);
        const closeIncompleteUploadConnection = () => {
            if (
                contract.meta.transport?.requestBody &&
                !request.readableEnded &&
                !response.headersSent &&
                !response.destroyed
            ) {
                response.setHeader("Connection", "close");
            }
        };
        let result: z.infer<EndpointResponsesSchema>;
        try {
            result = (await action(
                createContext(request, response),
                parsed.data as z.infer<Contract["request"]>,
                { request, signal: controller.signal }
            )) as z.infer<EndpointResponsesSchema>;
        } catch (error) {
            request.off("aborted", abort);
            response.off("close", close);
            closeIncompleteUploadConnection();
            throw error;
        }
        closeIncompleteUploadConnection();
        if (result.status >= 400) {
            request.off("aborted", abort);
            response.off("close", close);
            executeEffects(response, result.effects);
            return sendProblem(
                response,
                withProblemInstance(
                    result.body as ReturnType<typeof invalidRequestProblem>,
                    request.path
                )
            );
        }
        executeEffects(response, result.effects);
        response.status(result.status);
        if (result.status === 204) {
            request.off("aborted", abort);
            response.off("close", close);
            return response.send();
        }
        const responseVariant = contract.response.options.find(
            (variant) => variant.shape.status.value === result.status
        );
        const mediaType = responseVariant?.meta()?.mediaType;
        if (contract.meta.transport?.responseBody === "stream") {
            if (!(result.body instanceof Readable)) {
                throw new Error("Endpoint de stream retornou corpo inválido.");
            }
            if (typeof mediaType === "string") {
                response.setHeader("Content-Type", mediaType);
            }
            try {
                await pipeline(result.body, response, {
                    signal: controller.signal
                });
            } finally {
                request.off("aborted", abort);
                response.off("close", close);
            }
            return;
        }
        request.off("aborted", abort);
        response.off("close", close);
        if (typeof mediaType === "string" && mediaType !== "application/json") {
            if (!response.hasHeader("Content-Type")) {
                response.setHeader("Content-Type", mediaType);
            }
            return response.send(result.body);
        }
        return response.json(result.body);
    };
}
