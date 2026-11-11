import type { AppConfig } from "#/Config.js";
import { ForbiddenError } from "@pomi/api-core";
import type { PrismaClient } from "@pomi/db";
import { jwtVerify } from "jose";

export type ExchangeNoticeUnsubscribeService = {
    unsubscribe(userId: number, token: string): Promise<void>;
};

export function createExchangeNoticeUnsubscribeService({
    config,
    prisma
}: {
    config: AppConfig;
    prisma: PrismaClient;
}): ExchangeNoticeUnsubscribeService {
    return {
        async unsubscribe(userId, token) {
            if (!config.notifierUnsubscribeSecret)
                throw new Error("Notifier unsubscribe is not configured");
            const { payload } = await jwtVerify(
                token,
                new TextEncoder().encode(config.notifierUnsubscribeSecret)
            ).catch(() => {
                throw new ForbiddenError(
                    "Link de descadastro inválido ou expirado."
                );
            });
            if (
                payload.identityVersion !== 2 ||
                payload.action !== "exchange-notice-unsubscribe" ||
                typeof payload.sub !== "string" ||
                !/^[1-9][0-9]*$/.test(payload.sub)
            )
                throw new ForbiddenError("Link de descadastro inválido.");
            const tokenUserId = Number(payload.sub);
            if (tokenUserId !== userId)
                throw new ForbiddenError("O link não autoriza este usuário.");
            await prisma.exchangeNoticeSubscription.updateMany({
                where: { userId },
                data: { enabled: false }
            });
        }
    };
}
