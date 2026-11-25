import { createModule } from "#/Module.js";
import authIdentity from "./auth-identity/AuthIdentity.controller.js";
import botGrant from "./bot-grant/BotGrant.controller.js";
import currentUser from "./current-user/CurrentUser.controller.js";
import user from "./user/User.controller.js";

export default createModule({
    controllers: [currentUser, botGrant, authIdentity, user]
});
