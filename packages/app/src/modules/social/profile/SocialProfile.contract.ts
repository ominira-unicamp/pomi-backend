import { policies, StudentCapabilities } from "#/Authorization.js";
import { OutputBuilder, type IO } from "#/Contract.js";
import { pathSeg, ResourceNotFoundProblemSchema } from "@pomi/api-core";
import z from "zod";
import { ownProfile, profileBody, sidPath } from "../Social.schemas.js";

const profilePath = [
    pathSeg.literal("student"),
    pathSeg.param("sid"),
    pathSeg.literal("public-profile")
];
const read = policies.studentAccess("sid", StudentCapabilities.SOCIAL_READ);
const write = policies.studentAccess("sid", StudentCapabilities.SOCIAL_WRITE);

const getProfile = {
    meta: {
        operationId: "getStudentPublicProfile",
        sdk: {
            resource: "studentSocial",
            method: "getProfile",
            action: "get" as const,
            pathParameters: { sid: "studentId" }
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
        operationId: "updateStudentPublicProfile",
        sdk: {
            resource: "studentSocial",
            method: "updateProfile",
            action: "update" as const,
            pathParameters: { sid: "studentId" }
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
