import {
    policies,
    StudentCapabilities,
    type AuthorizationPolicy
} from "#/Authorization.js";
import { createAppEndpointRegistries } from "#/BuildHandler.js";
import { OutputBuilder, type IO } from "#/Contract.js";
import {
    ApiResponse,
    NotFoundError,
    pathParam,
    pathSeg,
    ResourceNotFoundProblemSchema,
    type EndpointActions
} from "@pomi/api-core";
import type { PrismaClient } from "@pomi/db";
import z from "zod";

const path = z.object({ userId: pathParam.positiveInteger() });
const base = [pathSeg.literal("users"), pathSeg.param("userId")];
const entity = z
    .object({
        id: z.number().int(),
        principalId: z.number().int(),
        name: z.string().nullable(),
        studentId: z.number().int().nullable()
    })
    .strict()
    .openapi("UserEntity", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "User",
            identityFields: ["id"]
        }
    });
const preferences = z
    .object({ favoriteCurriculumId: z.number().int().nullable() })
    .strict()
    .openapi("UserPreferences", {
        "x-pomi-schema": { kind: "value-object", publicName: "UserPreferences" }
    });
const metadata = (
    resource: string,
    method: "get" | "update",
    preference = false
) => ({
    operationId: `${method}${preference ? "UserPreferences" : "User"}`,
    method: method === "get" ? ("get" as const) : ("patch" as const),
    path: preference ? [...base, pathSeg.literal("preferences")] : base,
    sdk: {
        resource,
        method,
        action: method,
        pathParameters: { userId: "userId" }
    },
    tags: ["users"],
    authorization: policies.userAccess(
        "userId",
        method === "get"
            ? StudentCapabilities.PROFILE_READ
            : preference
              ? StudentCapabilities.PLANNING_WRITE
              : StudentCapabilities.PROFILE_WRITE
    )
});
const contracts = {
    get: {
        meta: metadata("users", "get"),
        request: z.object({ path }),
        response: new OutputBuilder()
            .ok(entity, "Usuário recuperado")
            .problem(
                404,
                ResourceNotFoundProblemSchema,
                "Usuário não encontrado"
            )
            .build()
    },
    patch: {
        meta: metadata("users", "update"),
        request: z.object({
            path,
            body: z
                .object({ name: z.string().trim().min(1).max(200).nullable() })
                .strict()
        }),
        response: new OutputBuilder()
            .ok(entity, "Usuário recuperado")
            .problem(
                404,
                ResourceNotFoundProblemSchema,
                "Usuário não encontrado"
            )
            .build()
    },
    getPreferences: {
        meta: metadata("userPreferences", "get", true),
        request: z.object({ path }),
        response: new OutputBuilder()
            .ok(preferences, "Preferências recuperadas")
            .problem(
                404,
                ResourceNotFoundProblemSchema,
                "Usuário ou currículo não encontrado"
            )
            .build()
    },
    patchPreferences: {
        meta: metadata("userPreferences", "update", true),
        request: z.object({ path, body: preferences }),
        response: new OutputBuilder()
            .ok(preferences, "Preferências recuperadas")
            .problem(
                404,
                ResourceNotFoundProblemSchema,
                "Usuário ou currículo não encontrado"
            )
            .build()
    }
} satisfies Record<string, IO>;
type Context = { prisma: PrismaClient };
const selection = {
    id: true,
    principalId: true,
    name: true,
    studentId: true
} as const;
const actions: EndpointActions<typeof contracts, AuthorizationPolicy, Context> =
    {
        get: async ({ prisma }, input) => {
            const user = await prisma.user.findUnique({
                where: { id: input.path.userId },
                select: selection
            });
            if (!user) throw new NotFoundError("Usuário não encontrado.");
            return ApiResponse.ok(user);
        },
        patch: async ({ prisma }, input) => {
            if (
                !(await prisma.user.findUnique({
                    where: { id: input.path.userId },
                    select: { id: true }
                }))
            )
                throw new NotFoundError("Usuário não encontrado.");
            return ApiResponse.ok(
                await prisma.user.update({
                    where: { id: input.path.userId },
                    data: input.body,
                    select: selection
                })
            );
        },
        getPreferences: async ({ prisma }, input) => {
            const user = await prisma.user.findUnique({
                where: { id: input.path.userId },
                select: { favoriteCurriculumId: true }
            });
            if (!user) throw new NotFoundError("Usuário não encontrado.");
            return ApiResponse.ok(user);
        },
        patchPreferences: async ({ prisma }, input) =>
            ApiResponse.ok(
                await prisma.$transaction(async (tx) => {
                    const user = await tx.user.findUnique({
                        where: { id: input.path.userId },
                        select: { id: true }
                    });
                    if (!user)
                        throw new NotFoundError("Usuário não encontrado.");
                    if (
                        input.body.favoriteCurriculumId !== null &&
                        !(await tx.curriculum.findFirst({
                            where: {
                                id: input.body.favoriteCurriculumId,
                                userId: user.id
                            },
                            select: { id: true }
                        }))
                    )
                        throw new NotFoundError(
                            "Currículo não encontrado para este usuário."
                        );
                    return tx.user.update({
                        where: { id: user.id },
                        data: input.body,
                        select: { favoriteCurriculumId: true }
                    });
                })
            )
    };
const { router, registry, authRegistry } = createAppEndpointRegistries({
    contracts,
    actions,
    createContext: (request) => ({ prisma: request.scope.cradle.prisma })
});
export default { contracts, router, registry, authRegistry };
