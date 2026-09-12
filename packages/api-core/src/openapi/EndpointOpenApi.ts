import type { RouteConfig } from "@asteasolutions/zod-to-openapi";
import z from "zod";

import type {
    EndpointContract,
    PaginationMetadata,
    SdkOperationMetadata
} from "../http/EndpointContract.js";
import { pathSegmentToOpenApiPath } from "../PathSegment.js";
import {
    operationIdFromEndpoint,
    summaryFromOperationId
} from "./OperationMetadata.js";
import RequestBuilder from "./RequestBuilder.js";
import ResponseBuilder from "./ResponseBuilder.js";

export function openApiFromEndpoint(
    contract: EndpointContract<unknown>
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

    const responses = new ResponseBuilder();
    const statuses = new Set<number>();
    for (const variant of contract.response.options) {
        const status = variant.shape.status.value;
        const schema = (
            variant.shape.body as z.ZodOptional<z.ZodType>
        ).unwrap();
        statuses.add(status);
        switch (status) {
            case 200:
                responses.ok(
                    schema,
                    variant.meta()?.description ?? "Successful response"
                );
                break;
            case 201:
                responses.created(
                    schema,
                    variant.meta()?.description ??
                        "Resource created successfully"
                );
                break;
            case 204:
                responses.noContent();
                break;
            default:
                if (status >= 400) {
                    responses.problem(
                        status,
                        schema,
                        variant.meta()?.description ?? "Problema"
                    );
                } else {
                    responses.statusCode(
                        status,
                        schema,
                        variant.meta()?.description ?? "Response"
                    );
                }
        }
    }
    if (!statuses.has(400)) responses.badRequest();
    if (!statuses.has(500)) responses.internalServerError();

    const operationId =
        contract.meta.operationId ??
        operationIdFromEndpoint(
            contract.meta.method,
            contract.meta.path,
            contract.meta.tags
        );
    const sdk = contract.meta.sdk ?? sdkMetadata(operationId, contract);
    const pagination =
        contract.meta.pagination ?? linkPaginationMetadata(contract, sdk);

    return {
        method: contract.meta.method,
        path: pathSegmentToOpenApiPath(contract.meta.path),
        tags: contract.meta.tags,
        operationId,
        summary: contract.meta.summary ?? summaryFromOperationId(operationId),
        ...(contract.meta.description
            ? { description: contract.meta.description }
            : {}),
        ...(contract.meta.deprecated !== undefined
            ? { deprecated: contract.meta.deprecated }
            : {}),
        ...(sdk ? { "x-pomi-sdk": sdk } : {}),
        ...(pagination ? { "x-pomi-pagination": pagination } : {}),
        request: request.build(),
        responses: responses.build()
    } as RouteConfig;
}

function sdkMetadata(
    operationId: string,
    contract: EndpointContract<unknown>
): SdkOperationMetadata | undefined {
    const match = /^(list|get|create|update|delete)([A-Z].*)$/.exec(
        operationId
    );
    if (!match) return undefined;

    const action = match[1] as SdkOperationMetadata["action"];
    const resource = `${match[2][0].toLowerCase()}${match[2].slice(1)}`;
    const singular = resource.endsWith("ies")
        ? `${resource.slice(0, -3)}y`
        : resource.endsWith("s")
          ? resource.slice(0, -1)
          : resource;
    const pathParameters = Object.fromEntries(
        contract.meta.path.flatMap((segment) => {
            if (segment.type !== "param") return [];
            if (segment.name === "sid") return [[segment.name, "studentId"]];
            if (segment.name === "id") return [[segment.name, `${singular}Id`]];
            return [[segment.name, segment.name]];
        })
    );

    return { resource, action, pathParameters };
}

function linkPaginationMetadata(
    contract: EndpointContract<unknown>,
    sdk: SdkOperationMetadata | undefined
): PaginationMetadata | undefined {
    if (sdk?.action !== "list") return undefined;
    const response = contract.response.options.find((variant) => {
        const status = variant.shape.status.value;
        return status >= 200 && status < 300;
    });
    const schema = response
        ? (response.shape.body as z.ZodOptional<z.ZodType>).unwrap()
        : undefined;
    if (
        !schema ||
        !schemaHasPath(schema, "data") ||
        !schemaHasPath(schema, "_paths.next")
    )
        return undefined;
    return {
        itemsField: "data",
        nextField: "_paths.next",
        defaultPageSize: 100,
        maxPageSize: 1000
    };
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
