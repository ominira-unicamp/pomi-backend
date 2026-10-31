import { AuthRegistry } from "#/auth.js";
import type { ModuleDefinition } from "#/modules/Module.js";
import avatar from "#/modules/group/GroupAvatar.endpoints.js";
import event from "#/modules/group/event/GroupEvent.controller.js";
import group from "#/modules/group/index.js";
import invitation from "#/modules/group/invitation/GroupInvitation.controller.js";
import membership from "#/modules/group/membership/GroupMembership.controller.js";
import role from "#/modules/group/role/GroupRole.controller.js";
import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { Router } from "express";

const controllers: ModuleDefinition["controllers"] = [
    group,
    avatar,
    membership,
    invitation,
    role,
    event
];
export default {
    router: Router().use(controllers.map((controller) => controller.router!)),
    registry: new OpenAPIRegistry(
        controllers.map((controller) => controller.registry!)
    ),
    authRegistry: new AuthRegistry(
        controllers.map((controller) => controller.authRegistry!)
    ),
    controllers
} satisfies ModuleDefinition;
