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
    studentAvatarResource,
    type StudentAvatarTarget
} from "./StudentAvatar.js";

const pathSchema = z.object({ sid: pathParam.positiveInteger() });
export const studentAvatarEndpoints = {
    resource: studentAvatarResource,
    path: [
        pathSeg.literal("student"),
        pathSeg.param("sid"),
        pathSeg.literal("avatar")
    ],
    pathSchema,
    target: ({ path }) => ({ studentId: path.sid }),
    authorization: policies.studentAccess(
        "sid",
        StudentCapabilities.PROFILE_WRITE
    ),
    operations: {
        replace: "putStudentAvatar",
        remove: "deleteStudentAvatar"
    } as const,
    tags: ["media"],
    sdk: { resource: "media", pathParameters: { sid: "studentId" } }
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
