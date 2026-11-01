import { ImageResourceRegistry } from "#/media/ImageResourceRegistry.js";
import { groupAvatarResource } from "#/modules/group/avatar/GroupAvatar.resource.js";
import { studentAvatarResource } from "#/modules/student/avatar/StudentAvatar.resource.js";

export { groupAvatarResource, studentAvatarResource };

export function createAppImageResourceRegistry() {
    return new ImageResourceRegistry([
        studentAvatarResource,
        groupAvatarResource
    ]);
}
