import { policies, UserCapabilities } from "#/Authorization.js";
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
    userId: pathParam.positiveInteger(),
    groupId: pathParam.positiveInteger()
});
export const groupAvatarEndpoints = {
    resource: groupAvatarResource,
    path: [
        pathSeg.literal("users"),
        pathSeg.param("userId"),
        pathSeg.literal("groups"),
        pathSeg.param("groupId"),
        pathSeg.literal("avatar")
    ],
    pathSchema,
    target: ({ path }) => ({ userId: path.userId, groupId: path.groupId }),
    authorization: policies.userAccess(
        "userId",
        UserCapabilities.PROFILE_WRITE
    ),
    operations: {
        replace: "putGroupAvatar",
        remove: "deleteGroupAvatar"
    } as const,
    tags: ["media"],
    sdk: {
        resource: "media",
        pathParameters: { userId: "userId", groupId: "groupId" }
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
