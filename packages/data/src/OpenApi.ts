import { OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import { apiReference } from "@scalar/express-api-reference";
import type { Request, Response } from "express";
import { Router } from "express";

import { dataControllers } from "#/Controllers.js";
import {
    operationIdFromOpenApiPath,
    queryFilterOperatorMetadata
} from "@pomi/api-core";

function expressPath(path: string) {
    return path.replace(/\/:([\w-]+)/g, "/{$1}");
}

function isPublicRoute(
    definition: (typeof dataControllers.registry.definitions)[number]
) {
    if (definition.type !== "route") return true;
    return dataControllers.authRegistry.rules.some(
        (rule) =>
            rule.policy.kind === "public" &&
            rule.method.toLowerCase() === definition.route.method &&
            expressPath(rule.path) === definition.route.path
    );
}

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

function sdkMetadata(operationId: string) {
    const match = /^(list|get|create|update|delete)([A-Z].*)$/.exec(
        operationId
    );
    if (!match) return undefined;
    return {
        resource: `${match[2][0].toLowerCase()}${match[2].slice(1)}`,
        action: match[1]
    };
}

export function generateDataOpenApiDocument(audience: "public" | "all") {
    const definitions =
        audience === "all"
            ? dataControllers.registry.definitions
            : dataControllers.registry.definitions.filter(isPublicRoute);
    const document = new OpenApiGeneratorV3(definitions).generateDocument({
        openapi: "3.0.0",
        info: {
            version: "1.0.0",
            title: "POMI Data API",
            description: "Public university data normalized by POMI"
        },
        servers: [{ url: "", description: "POMI Data" }]
    });
    document.components ??= {};
    document.components.securitySchemes ??= {};
    document.components.securitySchemes.DataAdminToken = {
        type: "http",
        scheme: "bearer",
        description: "POMI Data administration service token"
    };
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
            operation.summary ??= operationId;
            operation["x-pomi-sdk"] ??= sdkMetadata(operationId);

            const policy = dataControllers.authRegistry.rules.find(
                (rule) =>
                    rule.method.toLowerCase() === method &&
                    expressPath(rule.path) === path
            )?.policy.kind;
            operation.security =
                policy === "public" || audience === "public"
                    ? []
                    : [{ DataAdminToken: [] }];
        }
    }
    document.tags = [...tags].map((name) => ({ name }));
    document["x-pomi-filter-operators"] = {
        version: 1,
        operators: queryFilterOperatorMetadata
    };
    return document;
}

const router = Router();
router.get("/public-openapi.json", (_req: Request, res: Response) =>
    res.json(generateDataOpenApiDocument("public"))
);
router.get("/openapi.json", (_req: Request, res: Response) =>
    res.json(generateDataOpenApiDocument("all"))
);
router.use("/public-docs", apiReference({ url: "/public-openapi.json" }));
router.use("/docs", apiReference({ url: "/openapi.json" }));

export default router;
