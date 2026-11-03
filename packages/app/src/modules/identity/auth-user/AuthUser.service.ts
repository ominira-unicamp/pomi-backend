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
                await prisma.authIdentity.findMany({
                    ...prismaAuthUserSelection,
                    orderBy: compileSort(
                        resolveSort(query.sort, authUserSort),
                        {
                            id: (direction) => ({ legacyId: direction }),
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
        async create(actor, input) {
            const identity = await runIdentityTransaction(
                prisma,
                async (tx) => {
                    const existing = await tx.authIdentity.findUnique({
                        where: {
                            issuer_subject: {
                                issuer: actor.issuer,
                                subject: input.subject
                            }
                        },
                        include: canonicalIdentityInclude
                    });
                    if (!existing)
                        return createCanonicalIdentity(
                            tx,
                            {
                                issuer: actor.issuer,
                                subject: input.subject,
                                displayName: input.displayName,
                                roles: [{ role: AuthRoles.BOT }],
                                capabilities: input.capabilities.map(
                                    (capability) => ({ capability })
                                )
                            },
                            "SERVICE"
                        );
                    const { principal } = canonicalIdentity(existing);
                    await tx.authIdentityRole.upsert({
                        where: {
                            authIdentityId_role: {
                                authIdentityId: existing.id,
                                role: AuthRoles.BOT
                            }
                        },
                        create: {
                            authIdentityId: existing.id,
                            role: AuthRoles.BOT
                        },
                        update: {}
                    });
                    if (principal.user)
                        await tx.user.update({
                            where: { id: principal.user.id },
                            data: { name: input.displayName }
                        });
                    if (principal.serviceAccount)
                        await tx.serviceAccount.update({
                            where: { id: principal.serviceAccount.id },
                            data: { name: input.displayName }
                        });
                    return tx.authIdentity.update({
                        where: { id: existing.id },
                        data: {
                            displayName: input.displayName,
                            status: "ACTIVE"
                        },
                        ...prismaAuthUserSelection
                    });
                }
            );
            return authUserPresenter.build(identity);
        },
        async patch(legacyId, input) {
            return runIdentityTransaction(prisma, async (tx) => {
                const existing = await tx.authIdentity.findUnique({
                    where: { legacyId },
                    include: { ...canonicalIdentityInclude, roles: true }
                });
                if (!existing) return err(authUserNotFoundProblem());
                if (existing.roles.some(({ role }) => role === AuthRoles.ADMIN))
                    return err(adminIdentityManagedByCliProblem());
                const { principal } = canonicalIdentity(existing);
                if (input.displayName) {
                    if (principal.user)
                        await tx.user.update({
                            where: { id: principal.user.id },
                            data: { name: input.displayName }
                        });
                    if (principal.serviceAccount)
                        await tx.serviceAccount.update({
                            where: { id: principal.serviceAccount.id },
                            data: { name: input.displayName }
                        });
                }
                if (input.capabilities) {
                    await tx.authIdentityCapability.deleteMany({
                        where: { authIdentityId: existing.id }
                    });
                    await tx.authIdentityCapability.createMany({
                        data: input.capabilities.map((capability) => ({
                            authIdentityId: existing.id,
                            capability
                        }))
                    });
                }
                const updated = await tx.authIdentity.update({
                    where: { id: existing.id },
                    data: {
                        ...(input.status ? { status: input.status } : {}),
                        ...(input.displayName
                            ? { displayName: input.displayName }
                            : {})
                    },
                    ...prismaAuthUserSelection
                });
                return ok(authUserPresenter.build(updated));
            });
        }
    };
}
