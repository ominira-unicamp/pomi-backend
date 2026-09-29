import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { Router } from "express";

import { AuthRegistry } from "#/auth.js";
import academic from "#/modules/academic/index.js";
import catalog from "#/modules/catalog/index.js";
import exchange from "#/modules/exchange/index.js";
import type { ControllerDefinition } from "#/modules/Module.js";
import schedule from "#/modules/schedule/index.js";

const modules = [academic, catalog, exchange, schedule];
const controllers: ControllerDefinition[] = modules.flatMap(
    (module) => module.controllers
);

export const dataControllers = {
    router: Router().use(modules.map((module) => module.router)),
    registry: new OpenAPIRegistry(
        controllers
            .filter((controller) => controller.registry)
            .map((controller) => controller.registry!)
    ),
    authRegistry: new AuthRegistry(
        modules.map((module) => module.authRegistry)
    ),
    all: controllers
};

export default dataControllers;
