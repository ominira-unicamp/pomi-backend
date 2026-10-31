import { createModule } from "#/Module.js";
import socialFriendship from "./friendship/SocialFriendship.controller.js";
import socialPeople from "./people/SocialPeople.controller.js";
import socialProfile from "./profile/SocialProfile.controller.js";

export default createModule({
    controllers: [socialProfile, socialPeople, socialFriendship]
});
