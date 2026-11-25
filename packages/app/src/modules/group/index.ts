import { createModule } from "#/Module.js";
import group from "./Group.controller.js";
import groupAvatar from "./avatar/GroupAvatar.endpoints.js";
import groupEvent from "./event/GroupEvent.controller.js";
import groupInvitation from "./invitation/GroupInvitation.controller.js";
import groupMembership from "./membership/GroupMembership.controller.js";
import groupRole from "./role/GroupRole.controller.js";

export default createModule({
    controllers: [
        group,
        groupAvatar,
        groupMembership,
        groupInvitation,
        groupRole,
        groupEvent
    ]
});
