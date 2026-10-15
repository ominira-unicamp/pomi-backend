import { AuthRegistry } from "#/auth.js";
import type { ModuleDefinition } from "#/modules/Module.js";
import community from "#/modules/group/GroupCommunity.controller.js";
import group from "#/modules/group/index.js";
import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { Router } from "express";

const controllers: ModuleDefinition["controllers"] = [group, community];
export default {
    router: Router().use(group.router!, community.router!),
    registry: new OpenAPIRegistry([group.registry!, community.registry!]),
    authRegistry: new AuthRegistry([
        group.authRegistry!,
        community.authRegistry!
    ]),
    controllers
} satisfies ModuleDefinition;
