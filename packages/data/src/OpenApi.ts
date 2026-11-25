import { OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import { apiReference } from "@scalar/express-api-reference";
import type { Request, Response } from "express";
import { Router } from "express";

import { dataControllers } from "#/Controllers.js";
import { dataTagGroups, dataTagMetadata } from "#/OpenApiMetadata.js";
import {
    assertOpenApiSdkCoverage,
    enrichSdkSchemaMetadata,
    operationIdFromOpenApiPath,
    queryFilterOperatorMetadata
} from "@pomi/api-core";

const operationMethods = new Set([
    "get",
    "put",
    "post",
    "patch",
    "delete",
    "options",
    "head",
    "trace"
]);

export function generateDataOpenApiDocument() {
    const document = new OpenApiGeneratorV3(
        dataControllers.registry.definitions
    ).generateDocument({
        openapi: "3.0.0",
        info: {
            version: "1.0.0",
            title: "POMI Data API",
            description: "Public university data normalized by POMI"
        },
        servers: [{ url: "", description: "POMI Data" }]
    });
    enrichSdkSchemaMetadata(document);
    document.components ??= {};
    const tags = new Set<string>();
    const operationIds = new Map<string, string>();
    for (const [path, item] of Object.entries(document.paths)) {
        for (const [method, value] of Object.entries(item ?? {})) {
            if (!operationMethods.has(method)) continue;
            if (!value || typeof value !== "object" || !("responses" in value))
                continue;
            const operation = value as Record<string, unknown>;
            const operationTags = Array.isArray(operation.tags)
                ? operation.tags.filter(
                      (tag): tag is string => typeof tag === "string"
                  )
                : [];
            operationTags.forEach((tag) => tags.add(tag));
            const operationId =
                typeof operation.operationId === "string"
                    ? operation.operationId
                    : operationIdFromOpenApiPath(
                          method as "get" | "put" | "post" | "patch" | "delete",
                          path,
                          operationTags
                      );
            const previousPath = operationIds.get(operationId);
            if (previousPath && previousPath !== `${method} ${path}`) {
                throw new Error(
                    `Duplicate OpenAPI operationId "${operationId}" for ${previousPath} and ${method} ${path}`
                );
            }
            operationIds.set(operationId, `${method} ${path}`);
            operation.operationId = operationId;
            if (operationTags.length !== 1) {
                throw new Error(
                    `OpenAPI operation ${operationId} must have exactly one tag`
                );
            }
            const tagMetadata = dataTagMetadata[operationTags[0]];
            if (!tagMetadata) {
                throw new Error(
                    `Missing OpenAPI metadata for tag "${operationTags[0]}"`
                );
            }
            const action = (
                operation["x-pomi-sdk"] as { action?: string } | undefined
            )?.action;
            operation.summary =
                action === "list"
                    ? `Listar ${tagMetadata.plural}`
                    : action === "get"
                      ? `Consultar ${tagMetadata.singular}`
                      : (operation.summary ?? operationId);
            if (operation.security !== undefined) {
                const security = operation.security;
                delete operation.security;
                operation.security = security;
            }
        }
    }
    const unusedTags = Object.keys(dataTagMetadata).filter(
        (name) => !tags.has(name)
    );
    if (unusedTags.length > 0) {
        throw new Error(
            `OpenAPI metadata references unused tags: ${unusedTags.join(", ")}`
        );
    }
    document.tags = [...tags].map((name) => {
        const metadata = dataTagMetadata[name];
        return {
            name,
            "description": metadata.description,
            "x-displayName": metadata.displayName
        };
    });
    document["x-tagGroups"] = dataTagGroups.map((name) => ({
        name,
        tags: [...tags].filter((tag) => dataTagMetadata[tag].group === name)
    }));
    document["x-pomi-filter-operators"] = {
        version: 1,
        operators: queryFilterOperatorMetadata
    };
    assertOpenApiSdkCoverage(document);
    return document;
}

const router = Router();
router.get("/", (_req: Request, res: Response) => res.redirect("/docs"));
router.get("/openapi.json", (_req: Request, res: Response) =>
    res.json(generateDataOpenApiDocument())
);
router.use("/docs", apiReference({ url: "/openapi.json" }));

export default router;
