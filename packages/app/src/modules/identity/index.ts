import { createModule } from "#/Module.js";
import authUser from "./auth-user/AuthUser.controller.js";
import botGrant from "./bot-grant/BotGrant.controller.js";
import currentUser from "./current-user/CurrentUser.controller.js";

export default createModule({
    controllers: [currentUser, botGrant, authUser]
});
