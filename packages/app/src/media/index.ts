import type { ModuleDefinition } from "#/Module.js";
import controller from "./Media.controller.js";

export default {
    router: controller.router,
    registry: controller.registry,
    authRegistry: controller.authRegistry,
    controllers: [controller]
} satisfies ModuleDefinition;
