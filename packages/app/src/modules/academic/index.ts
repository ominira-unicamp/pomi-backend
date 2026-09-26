import { AuthRegistry } from "#/auth.js";
import evaluationSummary from "#/modules/academic/evaluation-summary/index.js";
import type { ModuleDefinition } from "#/modules/Module.js";
import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { Router } from "express";

const controllers: ModuleDefinition["controllers"] = [evaluationSummary];

export default {
    router: Router().use(
        controllers
            .filter((controller) => controller.router)
            .map((controller) => controller.router!)
    ),
    registry: new OpenAPIRegistry(
        controllers
            .filter((controller) => controller.registry)
            .map((controller) => controller.registry!)
            .flat()
    ),
    authRegistry: new AuthRegistry(
        controllers
            .filter((controller) => controller.authRegistry)
            .map((controller) => controller.authRegistry!)
    ),
    controllers
} satisfies ModuleDefinition;
