import { AuthRegistry } from "#/auth.js";
import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { Router } from "express";

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

class CombinedOpenApiRegistry extends OpenAPIRegistry {
    constructor(private readonly registries: OpenAPIRegistry[]) {
        super();
    }

    override get definitions() {
        return [
            ...this.registries.flatMap((registry) => registry.definitions),
            ...super.definitions
        ];
    }
}

export function createModule({
    controllers
}: {
    controllers: ControllerDefinition[];
}): ModuleDefinition {
    const router = Router();
    for (const controller of controllers)
        if (controller.router) router.use(controller.router);
    return {
        router,
        registry: new CombinedOpenApiRegistry(
            controllers.flatMap((controller) =>
                controller.registry ? [controller.registry] : []
            )
        ),
        authRegistry: new AuthRegistry(
            controllers.flatMap((controller) =>
                controller.authRegistry ? [controller.authRegistry] : []
            )
        ),
        controllers
    };
}
