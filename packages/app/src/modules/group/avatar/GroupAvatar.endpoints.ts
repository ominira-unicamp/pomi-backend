import { policies, StudentCapabilities } from "#/Authorization.js";
import { createAppEndpointRegistries } from "#/BuildHandler.js";
import {
    createImageActions,
    createImageContracts,
    type ImageEndpointsDefinition
} from "#/media/http.js";
import type { ImageResourceOperations } from "#/media/public.js";
import type { Principal } from "#/Principal.js";
import { pathParam, pathSeg } from "@pomi/api-core";
import z from "zod";
import {
    groupAvatarResource,
    type GroupAvatarTarget
} from "./GroupAvatar.resource.js";

const pathSchema = z.object({
    sid: pathParam.positiveInteger(),
    id: pathParam.positiveInteger()
});
export const groupAvatarEndpoints = {
    resource: groupAvatarResource,
    path: [
        pathSeg.literal("student"),
        pathSeg.param("sid"),
        pathSeg.literal("groups"),
        pathSeg.param("id"),
        pathSeg.literal("avatar")
    ],
    pathSchema,
    target: ({ path }) => ({ studentId: path.sid, groupId: path.id }),
    authorization: policies.studentAccess(
        "sid",
        StudentCapabilities.PROFILE_WRITE
    ),
    operations: {
        replace: "putGroupAvatar",
        remove: "deleteGroupAvatar"
    } as const,
    tags: ["media"],
    sdk: {
        resource: "media",
        pathParameters: { sid: "studentId", id: "groupId" }
    }
} satisfies ImageEndpointsDefinition<GroupAvatarTarget, typeof pathSchema>;

const IO = createImageContracts(groupAvatarEndpoints);

type Context = {
    principal: Principal | undefined;
    avatars: ImageResourceOperations<GroupAvatarTarget>;
};
const actions = createImageActions(groupAvatarEndpoints, {
    operations: (context: Context) => context.avatars,
    actor: (context: Context) => context.principal
});
const { router, registry, authRegistry } = createAppEndpointRegistries<
    typeof IO,
    Context
>({
    contracts: IO,
    actions,
    createContext: (request): Context => ({
        principal: request.scope.cradle.principal,
        avatars: request.scope.cradle.groupAvatars
    })
});
export default { contracts: IO, router, registry, authRegistry };
