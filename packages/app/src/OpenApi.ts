import { OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import { apiReference } from "@scalar/express-api-reference";
import type { Request, Response } from "express";
import { Router } from "express";

import { appControllers } from "#/Controllers.js";
import {
    assertOpenApiSdkCoverage,
    enrichSdkSchemaMetadata,
    operationIdFromOpenApiPath,
    queryFilterOperatorMetadata
} from "@pomi/api-core";

function expressPath(path: string) {
    return path.replace(/\/:([\w-]+)/g, "/{$1}");
}

function policyFor(
    definition: (typeof appControllers.registry.definitions)[number]
) {
    if (definition.type !== "route") return "authenticated" as const;
    return (
        appControllers.authRegistry.rules.find(
            (rule) =>
                rule.method.toLowerCase() === definition.route.method &&
                expressPath(rule.path) === definition.route.path
        )?.policy.kind ?? "authenticated"
    );
}

function studentVisible(policy: ReturnType<typeof policyFor>) {
    return [
        "public",
        "authenticated",
        "student-access",
        "student-registration"
    ].includes(policy);
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

export function generateAppOpenApiDocument(audience: "student" | "all") {
    const definitions =
        audience === "all"
            ? appControllers.registry.definitions
            : appControllers.registry.definitions.filter((definition) =>
                  studentVisible(policyFor(definition))
              );
    const document = new OpenApiGeneratorV3(definitions).generateDocument({
        openapi: "3.0.0",
        info: {
            version: "1.0.0",
            title: "POMI App API",
            description: "Personal and authenticated POMI features"
        },
        servers: [{ url: "", description: "POMI App" }]
    });
    enrichSdkSchemaMetadata(document);
    document.components ??= {};
    document.components.securitySchemes ??= {};
    document.components.securitySchemes.BearerAuth = {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT"
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
            if (operation.security !== undefined) {
                const security = operation.security;
                delete operation.security;
                operation.security = security;
            }
        }
    }
    document.tags = [...tags].map((name) => ({ name }));
    document["x-pomi-filter-operators"] = {
        version: 1,
        operators: queryFilterOperatorMetadata
    };
    assertOpenApiSdkCoverage(document);
    return document;
}

const router = Router();
router.get("/student-openapi.json", (_req: Request, res: Response) =>
    res.json(generateAppOpenApiDocument("student"))
);
router.get("/openapi.json", (_req: Request, res: Response) =>
    res.json(generateAppOpenApiDocument("all"))
);
router.use("/student-docs", apiReference({ url: "/student-openapi.json" }));
router.use("/docs", apiReference({ url: "/openapi.json" }));

export default router;
