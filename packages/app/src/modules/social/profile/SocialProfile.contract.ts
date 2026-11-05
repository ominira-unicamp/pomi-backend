import { policies, StudentCapabilities } from "#/Authorization.js";
import { OutputBuilder, type IO } from "#/Contract.js";
import { pathSeg, ResourceNotFoundProblemSchema } from "@pomi/api-core";
import z from "zod";
import { ownProfile, profileBody, sidPath } from "../Social.schemas.js";

const profilePath = [
    pathSeg.literal("users"),
    pathSeg.param("userId"),
    pathSeg.literal("profile")
];
const read = policies.userAccess("userId", StudentCapabilities.SOCIAL_READ);
const write = policies.userAccess("userId", StudentCapabilities.SOCIAL_WRITE);

const getProfile = {
    meta: {
        operationId: "getUserProfile",
        sdk: {
            resource: "userSocial",
            method: "getProfile",
            action: "get" as const,
            pathParameters: { userId: "userId" }
        },
        method: "get" as const,
        path: profilePath,
        tags: ["student-social"],
        authorization: read
    },
    request: z.object({ path: sidPath }),
    response: new OutputBuilder()
        .ok(ownProfile, "Perfil público recuperado")
        .problem(404, ResourceNotFoundProblemSchema, "Aluno não encontrado")
        .build()
} satisfies IO;
const updateProfile = {
    meta: {
        operationId: "updateUserProfile",
        sdk: {
            resource: "userSocial",
            method: "updateProfile",
            action: "update" as const,
            pathParameters: { userId: "userId" }
        },
        method: "patch" as const,
        path: profilePath,
        tags: ["student-social"],
        authorization: write
    },
    request: z.object({ path: sidPath, body: profileBody }),
    response: new OutputBuilder()
        .ok(ownProfile, "Perfil público atualizado")
        .problem(404, ResourceNotFoundProblemSchema, "Aluno não encontrado")
        .build()
} satisfies IO;
export default { getProfile, updateProfile };
