import { ImageResourceRegistry } from "#/media/ImageResourceRegistry.js";
import { groupAvatarResource } from "#/modules/group/GroupAvatar.js";
import { studentAvatarResource } from "#/modules/planning/student/StudentAvatar.js";

export { groupAvatarResource, studentAvatarResource };

export function createAppImageResourceRegistry() {
    return new ImageResourceRegistry([
        studentAvatarResource,
        groupAvatarResource
    ]);
}
