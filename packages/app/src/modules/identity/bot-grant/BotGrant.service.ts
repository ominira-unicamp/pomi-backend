import { AuthRoles, type StudentCapability } from "#/auth.js";
import IO, {
    botGrantSort,
    botIdentitySort
} from "#/modules/identity/bot-grant/BotGrant.contract.js";
import { botNotFoundProblem } from "#/modules/identity/bot-grant/BotGrant.problems.js";
import { compileSort, err, ok, resolveSort, type Result } from "@pomi/api-core";
import type { PrismaClient } from "@pomi/db";
import z from "zod";

type BotGrant = z.infer<typeof IO.schemas.entity>;
type BotsQuery = z.infer<typeof IO.listBots.request>["query"];
type GrantsQuery = z.infer<typeof IO.list.request>["query"];

export type BotGrantService = {
    listBots(
        query: BotsQuery
    ): Promise<Array<{ id: number; displayName: string | null }>>;
    list(userId: number, query: GrantsQuery): Promise<BotGrant[]>;
    replace(
        userId: number,
        botAuthIdentityId: number,
        capabilities: StudentCapability[],
        authorAuthIdentityId: number
    ): Promise<Result<void, ReturnType<typeof botNotFoundProblem>>>;
};

export function createBotGrantService({
    prisma
}: {
    prisma: PrismaClient;
}): BotGrantService {
    return {
        listBots: async (query) =>
            (
                await prisma.authIdentity.findMany({
                    where: {
                        status: "ACTIVE",
                        principal: { status: "ACTIVE" },
                        roles: { some: { role: AuthRoles.BOT } }
                    },
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
        async list(userId, query) {
            const grants = await prisma.botGrant.findMany({
                where: { userId: userId },
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
            return grants.map((grant) => ({
                id: grant.id,
                userId: grant.userId,
                botAuthIdentityId: grant.botAuthIdentityId,
                grantedByAuthIdentityId: grant.grantedByAuthIdentityId,
                revokedByAuthIdentityId: grant.revokedByAuthIdentityId,
                capability: grant.capability,
                createdAt: grant.createdAt,
                revokedAt: grant.revokedAt,
                botAuthIdentity: grant.botAuthIdentity
            }));
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
