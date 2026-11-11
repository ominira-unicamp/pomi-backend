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
    studentAvatarResource,
    type StudentAvatarTarget
} from "./StudentAvatar.resource.js";

const pathSchema = z.object({ userId: pathParam.positiveInteger() });
export const studentAvatarEndpoints = {
    resource: studentAvatarResource,
    path: [
        pathSeg.literal("users"),
        pathSeg.param("userId"),
        pathSeg.literal("avatar")
    ],
    pathSchema,
    target: ({ path }) => ({ userId: path.userId }),
    authorization: policies.userAccess(
        "userId",
        UserCapabilities.PROFILE_WRITE
    ),
    operations: {
        replace: "putUserAvatar",
        remove: "deleteUserAvatar"
    } as const,
    tags: ["media"],
    sdk: { resource: "media", pathParameters: { userId: "userId" } }
} satisfies ImageEndpointsDefinition<StudentAvatarTarget, typeof pathSchema>;

const IO = createImageContracts(studentAvatarEndpoints);

type Context = {
    principal: Principal | undefined;
    avatars: ImageResourceOperations<StudentAvatarTarget>;
};
const actions = createImageActions(studentAvatarEndpoints, {
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
        avatars: request.scope.cradle.studentAvatars
    })
});
export default { contracts: IO, router, registry, authRegistry };
