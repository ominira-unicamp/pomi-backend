import { AuthRoles, type UserCapability } from "#/auth.js";
import IO, {
    botGrantSort,
    botIdentitySort
} from "#/modules/identity/bot-grant/BotGrant.contract.js";
import { botNotFoundProblem } from "#/modules/identity/bot-grant/BotGrant.problems.js";
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
import type { MyPrisma, PrismaClient } from "@pomi/db";
import z from "zod";

type BotGrant = z.infer<typeof IO.schemas.entity>;
type BotsQuery = z.infer<typeof IO.listBots.request>["query"];
type GrantsQuery = z.infer<typeof IO.list.request>["query"];

export type BotGrantService = {
    listBots(
        query: BotsQuery
    ): Promise<PageResult<{ id: number; displayName: string | null }>>;
    list(userId: number, query: GrantsQuery): Promise<PageResult<BotGrant>>;
    replace(
        userId: number,
        botAuthIdentityId: number,
        capabilities: UserCapability[],
        authorAuthIdentityId: number
    ): Promise<Result<void, ReturnType<typeof botNotFoundProblem>>>;
};

export function createBotGrantService({
    prisma
}: {
    prisma: PrismaClient;
}): BotGrantService {
    return {
        async listBots(query) {
            const pagination = resolvePagination(query, unpaginatedByDefault);
            const where: MyPrisma.AuthIdentityWhereInput = {
                status: "ACTIVE",
                principal: { status: "ACTIVE" },
                roles: { some: { role: AuthRoles.BOT } }
            };
            const total = await prisma.authIdentity.count({ where });
            return {
                items: (
                    await prisma.authIdentity.findMany({
                        ...prismaPaginationParams(pagination),
                        where,
                        select: { id: true, displayName: true },
                        orderBy: compileSort(
                            resolveSort(query.sort, botIdentitySort),
                            {
                                displayName: (direction) => ({
                                    displayName: direction
                                }),
                                id: (direction) => ({ id: direction })
                            }
                        )
                    })
                ).map(({ id, displayName }) => ({
                    id: id,
                    displayName
                })),
                total,
                pagination
            };
        },
        async list(userId, query) {
            const pagination = resolvePagination(query, unpaginatedByDefault);
            const where: MyPrisma.BotGrantWhereInput = { userId: userId };
            const total = await prisma.botGrant.count({ where });
            const grants = await prisma.botGrant.findMany({
                ...prismaPaginationParams(pagination),
                where,
                include: {
                    botAuthIdentity: {
                        select: { id: true, displayName: true }
                    },
                    grantedByAuthIdentity: { select: { id: true } },
                    revokedByAuthIdentity: { select: { id: true } }
                },
                orderBy: compileSort(resolveSort(query.sort, botGrantSort), {
                    createdAt: (direction) => ({ createdAt: direction }),
                    capability: (direction) => ({ capability: direction }),
                    botDisplayName: (direction) => ({
                        botAuthIdentity: { displayName: direction }
                    }),
                    id: (direction) => ({ id: direction })
                })
            });
            return {
                items: grants.map((grant) => ({
                    id: grant.id,
                    userId: grant.userId,
                    botAuthIdentityId: grant.botAuthIdentityId,
                    grantedByAuthIdentityId: grant.grantedByAuthIdentityId,
                    revokedByAuthIdentityId: grant.revokedByAuthIdentityId,
                    capability: grant.capability,
                    createdAt: grant.createdAt,
                    revokedAt: grant.revokedAt,
                    botAuthIdentity: grant.botAuthIdentity
                })),
                total,
                pagination
            };
        },
        async replace(
            userId,
            botAuthIdentityId,
            requested,
            authorAuthIdentityId
        ) {
            const author = await prisma.authIdentity.findFirst({
                where: {
                    id: authorAuthIdentityId,
                    status: "ACTIVE",
                    principal: { status: "ACTIVE" }
                },
                select: { id: true }
            });
            if (!author) return err(botNotFoundProblem());
            const bot = await prisma.authIdentity.findFirst({
                where: {
                    id: botAuthIdentityId,
                    status: "ACTIVE",
                    principal: { status: "ACTIVE" },
                    roles: { some: { role: AuthRoles.BOT } }
                },
                select: { id: true }
            });
            if (!bot) return err(botNotFoundProblem());
            const capabilities = [...new Set(requested)];
            await prisma.$transaction(async (tx) => {
                await tx.botGrant.updateMany({
                    where: {
                        userId: userId,
                        botAuthIdentityId: bot.id,
                        revokedAt: null,
                        ...(capabilities.length
                            ? { capability: { notIn: capabilities } }
                            : {})
                    },
                    data: {
                        revokedAt: new Date(),
                        revokedByAuthIdentityId: authorAuthIdentityId
                    }
                });
                const active = new Set(
                    (
                        await tx.botGrant.findMany({
                            where: {
                                userId: userId,
                                botAuthIdentityId: bot.id,
                                revokedAt: null
                            },
                            select: { capability: true }
                        })
                    ).map(({ capability }) => capability)
                );
                const missing = capabilities.filter(
                    (capability) => !active.has(capability)
                );
                if (missing.length)
                    await tx.botGrant.createMany({
                        data: missing.map((capability) => ({
                            userId: userId,
                            botAuthIdentityId: bot.id,
                            capability,
                            grantedByAuthIdentityId: authorAuthIdentityId
                        }))
                    });
            });
            return ok(undefined);
        }
    };
}
