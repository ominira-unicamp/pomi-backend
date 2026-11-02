import { AuthRoles, type Capability, type Principal } from "#/auth.js";
import IO, {
    authUserSort
} from "#/modules/identity/auth-user/AuthUser.contract.js";
import authUserPresenter from "#/modules/identity/auth-user/AuthUser.presenter.js";
import {
    adminIdentityManagedByCliProblem,
    authUserNotFoundProblem,
    type AuthUserProblem
} from "#/modules/identity/auth-user/AuthUser.problems.js";
import { prismaAuthUserSelection } from "#/modules/identity/auth-user/AuthUser.queries.js";
import { compileSort, err, ok, resolveSort, type Result } from "@pomi/api-core";
import {
    canonicalIdentity,
    canonicalIdentityInclude,
    createCanonicalIdentity,
    runIdentityTransaction,
    type PrismaClient
} from "@pomi/db";
import z from "zod";

type AuthUser = z.infer<typeof IO.schemas.entity>;
type ListQuery = z.infer<typeof IO.list.request>["query"];

type CreateInput = {
    subject: string;
    displayName: string;
    capabilities: Capability[];
};
type PatchInput = {
    status?: "ACTIVE" | "DISABLED";
    displayName?: string;
    capabilities?: Capability[];
};
export type AuthUserService = {
    list(query: ListQuery): Promise<AuthUser[]>;
    create(principal: Principal, input: CreateInput): Promise<AuthUser>;
    patch(
        id: number,
        input: PatchInput
    ): Promise<Result<AuthUser, AuthUserProblem>>;
};
export function createAuthUserService({
    prisma
}: {
    prisma: PrismaClient;
}): AuthUserService {
    return {
        async list(query) {
            return (
                await prisma.authUser.findMany({
                    ...prismaAuthUserSelection,
                    orderBy: compileSort(
                        resolveSort(query.sort, authUserSort),
                        {
                            id: (direction) => ({ id: direction }),
                            displayName: (direction) => ({
                                displayName: direction
                            }),
                            email: (direction) => ({ email: direction }),
                            status: (direction) => ({ status: direction })
                        }
                    )
                })
            ).map(authUserPresenter.build);
        },
        async create(principal, input) {
            const authUser = await runIdentityTransaction(
                prisma,
                async (tx) => {
                    const existing = await tx.authUser.findUnique({
                        where: {
                            issuer_subject: {
                                issuer: principal.issuer,
                                subject: input.subject
                            }
                        },
                        include: canonicalIdentityInclude
                    });
                    if (existing) canonicalIdentity(existing);
                    const authUser = await tx.authUser.upsert({
                        where: {
                            issuer_subject: {
                                issuer: principal.issuer,
                                subject: input.subject
                            }
                        },
                        create: {
                            issuer: principal.issuer,
                            subject: input.subject,
                            displayName: input.displayName,
                            roles: { create: { role: AuthRoles.BOT } },
                            capabilities: {
                                create: input.capabilities.map(
                                    (capability) => ({
                                        capability
                                    })
                                )
                            }
                        },
                        update: {
                            displayName: input.displayName,
                            status: "ACTIVE"
                        },
                        ...prismaAuthUserSelection
                    });
                    await tx.authUserRole.upsert({
                        where: {
                            authUserId_role: {
                                authUserId: authUser.id,
                                role: AuthRoles.BOT
                            }
                        },
                        create: {
                            authUserId: authUser.id,
                            role: AuthRoles.BOT
                        },
                        update: {}
                    });
                    if (!existing) {
                        await createCanonicalIdentity(
                            tx,
                            {
                                ...authUser,
                                studentId: null,
                                roles: [{ role: "BOT" }]
                            },
                            "SERVICE"
                        );
                    } else {
                        const { principal: canonical } =
                            canonicalIdentity(existing);
                        if (canonical.user)
                            await tx.user.update({
                                where: { id: canonical.user.id },
                                data: { name: input.displayName }
                            });
                        if (canonical.serviceAccount)
                            await tx.serviceAccount.update({
                                where: { id: canonical.serviceAccount.id },
                                data: { name: input.displayName }
                            });
                    }
                    return authUser;
                }
            );
            return authUserPresenter.build(authUser);
        },
        async patch(id, input) {
            const existing = await prisma.authUser.findUnique({
                where: { id },
                include: { ...canonicalIdentityInclude, roles: true }
            });
            if (!existing) return err(authUserNotFoundProblem());
            if (existing.roles.some((role) => role.role === AuthRoles.ADMIN))
                return err(adminIdentityManagedByCliProblem());
            const authUser = await runIdentityTransaction(
                prisma,
                async (tx) => {
                    const current = await tx.authUser.findUniqueOrThrow({
                        where: { id },
                        include: canonicalIdentityInclude
                    });
                    const { principal: canonical } = canonicalIdentity(current);
                    if (input.displayName) {
                        if (canonical.user)
                            await tx.user.update({
                                where: { id: canonical.user.id },
                                data: { name: input.displayName }
                            });
                        if (canonical.serviceAccount)
                            await tx.serviceAccount.update({
                                where: { id: canonical.serviceAccount.id },
                                data: { name: input.displayName }
                            });
                    }
                    if (input.capabilities) {
                        await tx.authUserCapability.deleteMany({
                            where: { authUserId: id }
                        });
                        await tx.authUserCapability.createMany({
                            data: input.capabilities.map((capability) => ({
                                authUserId: id,
                                capability
                            }))
                        });
                    }
                    return tx.authUser.update({
                        where: { id },
                        data: {
                            ...(input.status ? { status: input.status } : {}),
                            ...(input.displayName
                                ? { displayName: input.displayName }
                                : {})
                        },
                        ...prismaAuthUserSelection
                    });
                }
            );
            return ok(authUserPresenter.build(authUser));
        }
    };
}
