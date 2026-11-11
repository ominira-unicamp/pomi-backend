import IO from "#/modules/exchange/exchange-notice-subscription/ExchangeNoticeSubscription.contract.js";
import { canonicalUserId } from "#/modules/identity/UserContext.js";
import { err, ok, ReferenceNotFoundProblem, type Result } from "@pomi/api-core";
import type { PrismaClient } from "@pomi/db";
import z from "zod";

type Subscription = z.infer<typeof IO.entity>;
type PatchInput = z.infer<typeof IO.patch.request>["body"];

type SubscriptionProblem = ReturnType<typeof ReferenceNotFoundProblem.create>;

function build(
    userId: number,
    subscription?: {
        enabled: boolean;
        places: ReadonlyArray<{ placeId: number }>;
    } | null
): Subscription {
    return {
        userId,
        enabled: subscription?.enabled ?? false,
        placeIds: subscription?.places.map(({ placeId }) => placeId) ?? []
    };
}

export type ExchangeNoticeSubscriptionService = {
    get(userId: number): Promise<Subscription>;
    patch(
        userId: number,
        input: PatchInput
    ): Promise<Result<Subscription, SubscriptionProblem>>;
};

export function createExchangeNoticeSubscriptionService({
    prisma
}: {
    prisma: PrismaClient;
}): ExchangeNoticeSubscriptionService {
    return {
        async get(userId) {
            const subscription =
                await prisma.exchangeNoticeSubscription.findUnique({
                    where: { userId },
                    include: { places: { orderBy: { placeId: "asc" } } }
                });
            return build(
                canonicalUserId(
                    await prisma.user.findUniqueOrThrow({
                        where: { id: userId },
                        select: {
                            id: true,
                            studentId: true
                        }
                    })
                ),
                subscription
            );
        },
        async patch(userId, input) {
            if (input.placeIds) {
                const found = await prisma.exchangePlace.count({
                    where: { id: { in: input.placeIds } }
                });
                if (found !== input.placeIds.length)
                    return err(
                        ReferenceNotFoundProblem.create({
                            detail: "Um ou mais locais de intercâmbio não foram encontrados.",
                            fields: [
                                {
                                    code: "REFERENCE_NOT_FOUND",
                                    path: ["placeIds"],
                                    message:
                                        "Todos os locais informados devem existir."
                                }
                            ]
                        })
                    );
            }
            const subscription = await prisma.exchangeNoticeSubscription.upsert(
                {
                    where: { userId },
                    create: {
                        userId,
                        enabled: input.enabled ?? false,
                        places: input.placeIds
                            ? {
                                  create: input.placeIds.map((placeId) => ({
                                      placeId
                                  }))
                              }
                            : undefined
                    },
                    update: {
                        ...(input.enabled !== undefined
                            ? { enabled: input.enabled }
                            : {}),
                        ...(input.placeIds !== undefined
                            ? {
                                  places: {
                                      deleteMany: {},
                                      create: input.placeIds.map((placeId) => ({
                                          placeId
                                      }))
                                  }
                              }
                            : {})
                    },
                    include: { places: { orderBy: { placeId: "asc" } } }
                }
            );
            return ok(
                build(
                    canonicalUserId(
                        await prisma.user.findUniqueOrThrow({
                            where: { id: userId },
                            select: {
                                id: true,
                                studentId: true
                            }
                        })
                    ),
                    subscription
                )
            );
        }
    };
}
