import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import {
    isCompatibilityContract,
    pathSegmentToExpressPath
} from "@pomi/api-core";
import { Router } from "express";

import { AuthRegistry, type AuthorizationPolicy } from "#/auth.js";
import academic from "#/modules/academic/index.js";
import catalog from "#/modules/catalog/index.js";
import exchange from "#/modules/exchange/index.js";
import type { ControllerDefinition } from "#/modules/Module.js";
import schedule from "#/modules/schedule/index.js";

const modules = [academic, catalog, exchange, schedule];
const controllers: ControllerDefinition[] = modules.flatMap(
    (module) => module.controllers
);

const contractAuthRegistry = new AuthRegistry();
for (const controller of controllers) {
    for (const contract of Object.values(controller.contracts ?? {})) {
        if (!isCompatibilityContract(contract)) continue;
        contractAuthRegistry.addPolicy(
            contract.meta.method.toUpperCase() as
                | "GET"
                | "POST"
                | "PUT"
                | "PATCH"
                | "DELETE",
            pathSegmentToExpressPath(contract.meta.path),
            contract.meta.authorization as AuthorizationPolicy
        );
    }
}

const standaloneAuthRegistries = controllers
    .filter((controller) => !controller.contracts && controller.authRegistry)
    .map((controller) => controller.authRegistry!);

export const dataControllers = {
    router: Router().use(modules.map((module) => module.router)),
    registry: new OpenAPIRegistry(
        controllers
            .filter((controller) => controller.registry)
            .map((controller) => controller.registry!)
    ),
    authRegistry: new AuthRegistry([
        contractAuthRegistry,
        ...standaloneAuthRegistries
    ]),
    all: controllers
};

export default dataControllers;
