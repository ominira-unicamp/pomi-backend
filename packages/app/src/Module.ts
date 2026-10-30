import type { AuthRegistry } from "#/auth.js";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import type { Router } from "express";

export type ControllerDefinition = {
    router?: Router;
    registry?: OpenAPIRegistry;
    authRegistry?: AuthRegistry;
    contracts?: Record<string, unknown>;
};

export type ModuleDefinition = {
    router: Router;
    registry: OpenAPIRegistry;
    authRegistry: AuthRegistry;
    controllers: ControllerDefinition[];
};
