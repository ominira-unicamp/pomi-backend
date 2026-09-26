import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { Router } from "express";

import { AuthRegistry } from "#/auth.js";
import academic from "#/modules/academic/index.js";
import exchange from "#/modules/exchange/index.js";
import feedback from "#/modules/feedback/index.js";
import identity from "#/modules/identity/index.js";
import type { ControllerDefinition } from "#/modules/Module.js";
import planning from "#/modules/planning/index.js";
import social from "#/modules/social/index.js";
import studentTagInterest from "#/modules/student-tag-interest-module.js";
import tagging from "#/modules/tagging-module.js";

const modules = [
    academic,
    identity,
    planning,
    social,
    feedback,
    exchange,
    tagging,
    studentTagInterest
];
const controllers: ControllerDefinition[] = modules.flatMap(
    (module) => module.controllers
);

export const appControllers = {
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

export default appControllers;
