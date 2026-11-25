import media from "#/media/index.js";
import { createModule } from "#/Module.js";
import academic from "#/modules/academic/index.js";
import exchange from "#/modules/exchange/index.js";
import feedback from "#/modules/feedback/index.js";
import group from "#/modules/group/index.js";
import identity from "#/modules/identity/index.js";
import planning from "#/modules/planning/index.js";
import social from "#/modules/social/index.js";
import student from "#/modules/student/index.js";
import tagging from "#/modules/tagging/index.js";

const modules = [
    media,
    academic,
    identity,
    planning,
    social,
    feedback,
    group,
    exchange,
    tagging,
    student
];
const application = createModule({ controllers: modules });

export const appControllers = {
    router: application.router,
    registry: application.registry,
    authRegistry: application.authRegistry,
    all: modules.flatMap((module) => module.controllers)
};

export default appControllers;
