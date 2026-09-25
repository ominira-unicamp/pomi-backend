import type { RouteConfig } from "@asteasolutions/zod-to-openapi";
import z from "zod";

import {
    InvalidRequestProblemSchema,
    ServerErrorProblemSchema
} from "../errors/ProblemDetails.js";
import type { EndpointContract } from "../http/EndpointContract.js";
import { pathSegmentToOpenApiPath } from "../PathSegment.js";
import { summaryFromOperationId } from "./OperationMetadata.js";
import RequestBuilder from "./RequestBuilder.js";

export function openApiFromEndpoint(
    contract: EndpointContract<unknown>,
    options?: { security?: Array<Record<string, string[]>> }
): RouteConfig {
    let request = new RequestBuilder();
    const shape = contract.request.shape;
    if (shape.path)
        request = request.params(shape.path as z.ZodObject<z.ZodRawShape>);
    if (shape.query)
        request = request.query(shape.query as z.ZodObject<z.ZodRawShape>);
    if (shape.body) {
        request = request.body(
            shape.body,
            shape.body.meta()?.description ?? "Request body"
        );
    }

    const responses: RouteConfig["responses"] = {};
    const statuses = new Set<number>();
    for (const variant of contract.response.options) {
        const status = variant.shape.status.value;
        const schema = variant.shape.body;
        const metadata = variant.meta();
        const mediaType =
            typeof metadata?.mediaType === "string"
                ? metadata.mediaType
                : status >= 400
                  ? "application/problem+json"
                  : "application/json";
        statuses.add(status);
        responses[status] = {
            description:
                metadata?.description ??
                (status === 204 ? "No content" : "Response"),
            ...(schema ? { content: { [mediaType]: { schema } } } : {})
        };
    }
    if (!statuses.has(400)) {
        responses[400] = {
            description: "Dados da requisição inválidos",
            content: {
                "application/problem+json": {
                    schema: InvalidRequestProblemSchema
                }
            }
        };
    }
    if (!statuses.has(500)) {
        responses[500] = {
            description: "Não foi possível concluir a ação",
            content: {
                "application/problem+json": {
                    schema: ServerErrorProblemSchema
                }
            }
        };
    }

    const operationId = contract.meta.operationId;
    const sdk = contract.meta.sdk;
    const pagination = contract.meta.pagination;

    return {
        "method": contract.meta.method,
        "path": pathSegmentToOpenApiPath(contract.meta.path),
        "tags": contract.meta.tags,
        operationId,
        "summary": contract.meta.summary ?? summaryFromOperationId(operationId),
        ...(contract.meta.description
            ? { description: contract.meta.description }
            : {}),
        ...(contract.meta.deprecated !== undefined
            ? { deprecated: contract.meta.deprecated }
            : {}),
        "x-pomi-sdk": sdk,
        ...(pagination ? { "x-pomi-pagination": pagination } : {}),
        ...(options?.security ? { security: options.security } : {}),
        "request": request.build(),
        responses
    } as RouteConfig;
}
