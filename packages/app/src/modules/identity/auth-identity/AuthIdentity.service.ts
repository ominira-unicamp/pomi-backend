import { AuthRoles, type Capability } from "#/auth.js";
import IO, {
    authIdentitySort
} from "#/modules/identity/auth-identity/AuthIdentity.contract.js";
import authIdentityPresenter from "#/modules/identity/auth-identity/AuthIdentity.presenter.js";
import {
    adminIdentityManagedByCliProblem,
    authIdentityNotFoundProblem,
    type AuthIdentityProblem
} from "#/modules/identity/auth-identity/AuthIdentity.problems.js";
import { prismaAuthIdentitySelection } from "#/modules/identity/auth-identity/AuthIdentity.queries.js";
import {
    compileSort,
    err,
    ok,
    prismaPaginationParams,
    resolvePagination,
    resolveSort,
    unpaginatedByDefault,
    type PageResult,
    type Result
} from "@pomi/api-core";
import type { MyPrisma } from "@pomi/db";
import {
    canonicalIdentity,
    canonicalIdentityInclude,
    createCanonicalIdentity,
    runIdentityTransaction,
    type PrismaClient
} from "@pomi/db";
import z from "zod";

type AuthIdentity = z.infer<typeof IO.schemas.entity>;
type ListQuery = z.infer<typeof IO.list.request>["query"];
type CreateInput = {
    issuer: string;
    subject: string;
    displayName: string;
    capabilities: Capability[];
};
type PatchInput = {
    status?: "ACTIVE" | "DISABLED";
    displayName?: string;
    capabilities?: Capability[];
};
export type AuthIdentityService = {
    list(query: ListQuery): Promise<PageResult<AuthIdentity>>;
    create(input: CreateInput): Promise<AuthIdentity>;
    patch(
        id: number,
        input: PatchInput
    ): Promise<Result<AuthIdentity, AuthIdentityProblem>>;
};

export function createAuthIdentityService({
    prisma
}: {
    prisma: PrismaClient;
}): AuthIdentityService {
    return {
        async list(query) {
            const pagination = resolvePagination(query, unpaginatedByDefault);
            const where: MyPrisma.AuthIdentityWhereInput = {};
            const total = await prisma.authIdentity.count({ where });
            return {
                items: (
                    await prisma.authIdentity.findMany({
                        ...prismaPaginationParams(pagination),
                        where,
                        ...prismaAuthIdentitySelection,
                        orderBy: compileSort(
                            resolveSort(query.sort, authIdentitySort),
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
                ).map(authIdentityPresenter.build),
                total,
                pagination
            };
        },
        async create(input) {
            const identity = await runIdentityTransaction(
                prisma,
                async (tx) => {
                    const existing = await tx.authIdentity.findUnique({
                        where: {
                            issuer_subject: {
                                issuer: input.issuer,
                                subject: input.subject
                            }
                        },
                        include: canonicalIdentityInclude
                    });
                    if (!existing)
                        return createCanonicalIdentity(
                            tx,
                            {
                                issuer: input.issuer,
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
                        ...prismaAuthIdentitySelection
                    });
                }
            );
            return authIdentityPresenter.build(identity);
        },
        async patch(id, input) {
            return runIdentityTransaction(prisma, async (tx) => {
                const existing = await tx.authIdentity.findUnique({
                    where: { id },
                    include: { ...canonicalIdentityInclude, roles: true }
                });
                if (!existing) return err(authIdentityNotFoundProblem());
                if (existing.roles.some(({ role }) => role === AuthRoles.ADMIN))
                    return err(adminIdentityManagedByCliProblem());
                const { principal } = canonicalIdentity(existing);
                if (input.displayName) {
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
                    ...prismaAuthIdentitySelection
                });
                return ok(authIdentityPresenter.build(updated));
            });
        }
    };
}
