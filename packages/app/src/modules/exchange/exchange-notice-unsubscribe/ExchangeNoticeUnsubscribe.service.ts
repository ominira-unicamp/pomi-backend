import type { AppConfig } from "#/Config.js";
import type { PrismaClient } from "@pomi/db";
import { jwtVerify } from "jose";

export type ExchangeNoticeUnsubscribeService = {
    unsubscribe(token: string): Promise<void>;
};

export function createExchangeNoticeUnsubscribeService({
    config,
    prisma
}: {
    config: AppConfig;
    prisma: PrismaClient;
}): ExchangeNoticeUnsubscribeService {
    return {
        async unsubscribe(token) {
            if (!config.notifierUnsubscribeSecret)
                throw new Error("Notifier unsubscribe is not configured");
            const { payload } = await jwtVerify(
                token,
                new TextEncoder().encode(config.notifierUnsubscribeSecret)
            );
            if (
                payload.action !== "exchange-notice-unsubscribe" ||
                typeof payload.sub !== "string" ||
                !/^[1-9][0-9]*$/.test(payload.sub)
            )
                throw new Error("Invalid unsubscribe token");
            const userId =
                payload.identityVersion === 2
                    ? Number(payload.sub)
                    : (
                          await prisma.user.findUnique({
                              where: { legacyStudentId: Number(payload.sub) },
                              select: { id: true }
                          })
                      )?.id;
            if (userId === undefined) return;
            await prisma.exchangeNoticeSubscription.updateMany({
                where: { userId },
                data: { enabled: false }
            });
        }
    };
}
