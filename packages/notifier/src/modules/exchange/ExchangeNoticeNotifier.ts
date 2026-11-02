import type { NotifierConfig } from "#/Config.js";
import { withTrace } from "@pomi/api-core";
import type { PrismaClient } from "@pomi/db";
import { ExchangeNoticeDeliveryStatus } from "@pomi/db";
import { SignJWT } from "jose";
import { randomUUID } from "node:crypto";
import type { Logger } from "pino";

import { MailService } from "#/email/MailService.js";
import {
    exchangeNoticeDigestEmailTemplate,
    type ExchangeNoticeDigest
} from "#/modules/exchange/ExchangeNoticeDigestEmailTemplate.js";

const LOCK_ID = 724_401_816;
const PROCESSING_TIMEOUT_MS = 30 * 60 * 1000;

export class ExchangeNoticeNotifier {
    constructor(
        private readonly prisma: PrismaClient,
        private readonly config: NotifierConfig,
        private readonly logger: Logger,
        private readonly mailService: MailService
    ) {}

    async run(): Promise<void> {
        return withTrace("notifier.cycle", () => this.runCycle(), {
            attributes: {
                "notifier.cron": this.config.cron
            }
        })();
    }

    private async runCycle(): Promise<void> {
        const cycleId = randomUUID();
        const startedAt = Date.now();
        this.logger.info(
            {
                cycleId,
                cron: this.config.cron,
                maxAttempts: this.config.maxAttempts
            },
            "Ciclo de notificações iniciado."
        );
        let lockAcquired = false;
        try {
            const lock = await this.prisma.$queryRaw<
                ReadonlyArray<{ acquired: boolean }>
            >`SELECT pg_try_advisory_lock(${LOCK_ID}) AS acquired`;
            if (!lock[0]?.acquired) {
                this.logger.info(
                    { cycleId, lockId: LOCK_ID },
                    "Ciclo de notificações ignorado: lock já está ativo."
                );
                return;
            }
            lockAcquired = true;
            this.logger.debug(
                { cycleId, lockId: LOCK_ID },
                "Lock do ciclo de notificações adquirido."
            );
            const recovered = await this.recoverExpiredProcessing();
            this.logger.info(
                { cycleId, recovered },
                "Entregas em processamento recuperadas."
            );
            const created = await this.createPendingDeliveries();
            this.logger.info(
                { cycleId, ...created },
                "Entregas pendentes criadas."
            );
            const sent = await this.sendPendingDeliveries(cycleId);
            this.logger.info(
                { cycleId, ...sent, durationMs: Date.now() - startedAt },
                "Ciclo de notificações concluído."
            );
        } catch (error) {
            this.logger.error(
                {
                    err: error,
                    cycleId,
                    durationMs: Date.now() - startedAt
                },
                "Ciclo de notificações falhou durante o processamento."
            );
            throw error;
        } finally {
            if (lockAcquired) {
                await this.prisma
                    .$queryRaw`SELECT pg_advisory_unlock(${LOCK_ID})`;
                this.logger.debug(
                    { cycleId, lockId: LOCK_ID },
                    "Lock do ciclo de notificações liberado."
                );
            }
        }
    }

    private async recoverExpiredProcessing() {
        const processingBefore = new Date(Date.now() - PROCESSING_TIMEOUT_MS);
        const result = await this.prisma.exchangeNoticeDelivery.updateMany({
            where: {
                status: ExchangeNoticeDeliveryStatus.PROCESSING,
                processingAt: {
                    lt: processingBefore
                }
            },
            data: {
                status: ExchangeNoticeDeliveryStatus.PENDING,
                processingAt: null
            }
        });
        const recipients =
            await this.prisma.exchangeNoticeDeliveryRecipient.updateMany({
                where: {
                    status: "PROCESSING",
                    processingAt: { lt: processingBefore }
                },
                data: { status: "PENDING", processingAt: null }
            });
        return { deliveries: result.count, recipients: recipients.count };
    }

    private async createPendingDeliveries() {
        const now = new Date();
        const [notices, subscriptions] = await Promise.all([
            this.prisma.exchangeNotice.findMany({
                where: { registrationEnd: { gte: now } },
                include: { place: { select: { id: true, name: true } } }
            }),
            this.prisma.exchangeNoticeSubscription.findMany({
                where: { enabled: true },
                include: { places: { select: { placeId: true } } }
            })
        ]);
        let matchedDeliveries = 0;
        let createdDeliveries = 0;

        for (const subscription of subscriptions) {
            const placeIds = new Set(
                subscription.places.map(({ placeId }) => placeId)
            );
            const matchingNoticeIds = notices
                .filter(
                    (notice) =>
                        placeIds.size === 0 ||
                        (notice.placeId !== null &&
                            placeIds.has(notice.placeId))
                )
                .map((notice) => notice.id);
            matchedDeliveries += matchingNoticeIds.length;
            if (matchingNoticeIds.length === 0) {
                this.logger.debug(
                    {
                        userId: subscription.userId,
                        selectedPlaceCount: placeIds.size
                    },
                    "Assinatura sem editais correspondentes."
                );
                continue;
            }
            const result = await this.prisma.exchangeNoticeDelivery.createMany({
                data: matchingNoticeIds.map((noticeId) => ({
                    userId: subscription.userId,
                    noticeId
                })),
                skipDuplicates: true
            });
            createdDeliveries += result.count;
            this.logger.debug(
                {
                    userId: subscription.userId,
                    selectedPlaceCount: placeIds.size,
                    matchingNoticeCount: matchingNoticeIds.length,
                    createdDeliveryCount: result.count
                },
                "Entregas da assinatura processadas."
            );
        }
        return {
            noticeCount: notices.length,
            subscriptionCount: subscriptions.length,
            matchedDeliveries,
            createdDeliveries
        };
    }

    private async sendPendingDeliveries(cycleId: string) {
        const dueDeliveries = await this.prisma.exchangeNoticeDelivery.findMany(
            {
                where: {
                    status: {
                        in: [
                            ExchangeNoticeDeliveryStatus.PENDING,
                            ExchangeNoticeDeliveryStatus.FAILED
                        ]
                    },
                    nextAttemptAt: { lte: new Date() },
                    OR: [
                        { recipients: { none: {} } },
                        {
                            recipients: {
                                some: {
                                    status: { in: ["PENDING", "FAILED"] },
                                    nextAttemptAt: { lte: new Date() },
                                    attemptCount: {
                                        lt: this.config.maxAttempts
                                    }
                                }
                            }
                        }
                    ]
                },
                select: { userId: true },
                distinct: ["userId"]
            }
        );
        this.logger.info(
            { cycleId, userCount: dueDeliveries.length },
            "Estudantes com digests vencidos encontrados."
        );
        let attemptedUserCount = 0;
        for (const { userId } of dueDeliveries) {
            attemptedUserCount += 1;
            await this.sendUserDigest(userId, cycleId);
        }
        return { attemptedUserCount };
    }

    private async sendUserDigest(userId: number, cycleId: string) {
        return withTrace("notifier.digest", () =>
            this.sendUserDigestInternal(userId, cycleId)
        )();
    }

    private async sendUserDigestInternal(userId: number, cycleId: string) {
        const now = new Date();
        const subscription =
            await this.prisma.exchangeNoticeSubscription.findUnique({
                where: { userId },
                include: {
                    places: { select: { placeId: true } },
                    user: { select: { emails: { select: { email: true } } } }
                }
            });
        if (!subscription?.enabled) return;
        const emails = [
            ...new Set(
                subscription.user.emails.map(({ email }) =>
                    email.trim().toLowerCase()
                )
            )
        ].filter(Boolean);
        if (!emails.length) {
            this.logger.warn(
                { cycleId, userId },
                "Digest sem endereço de contato disponível."
            );
            return;
        }
        const placeIds = subscription.places.map(({ placeId }) => placeId);
        const deliveries = await this.prisma.exchangeNoticeDelivery.findMany({
            where: {
                userId,
                status: { in: ["PENDING", "FAILED"] },
                nextAttemptAt: { lte: now },
                notice: {
                    registrationEnd: { gte: now },
                    ...(placeIds.length ? { placeId: { in: placeIds } } : {})
                }
            },
            include: { notice: { include: { place: true } }, recipients: true }
        });
        for (const delivery of deliveries) {
            if (!delivery.recipients.length)
                await this.prisma.exchangeNoticeDeliveryRecipient.createMany({
                    data: emails.map((email) => ({
                        deliveryId: delivery.id,
                        nextAttemptAt: now,
                        email
                    })),
                    skipDuplicates: true
                });
        }
        const due = await this.prisma.exchangeNoticeDeliveryRecipient.findMany({
            where: {
                deliveryId: { in: deliveries.map(({ id }) => id) },
                status: { in: ["PENDING", "FAILED"] },
                nextAttemptAt: { lte: now },
                attemptCount: { lt: this.config.maxAttempts }
            },
            include: {
                delivery: { include: { notice: { include: { place: true } } } }
            }
        });
        const byAddress = new Map<string, typeof due>();
        for (const recipient of due) {
            const group = byAddress.get(recipient.email) ?? [];
            group.push(recipient);
            byAddress.set(recipient.email, group);
        }
        for (const [email, recipients] of byAddress) {
            const ids = recipients.map(({ id }) => id);
            const claimed = await this.prisma
                .$transaction(async (tx) => {
                    const result =
                        await tx.exchangeNoticeDeliveryRecipient.updateMany({
                            where: {
                                id: { in: ids },
                                status: { in: ["PENDING", "FAILED"] },
                                nextAttemptAt: { lte: now },
                                attemptCount: { lt: this.config.maxAttempts }
                            },
                            data: {
                                status: "PROCESSING",
                                processingAt: now,
                                attemptCount: { increment: 1 }
                            }
                        });
                    if (result.count !== ids.length)
                        throw new RecipientClaimConflict();
                    return result.count;
                })
                .catch((error) => {
                    if (error instanceof RecipientClaimConflict) return 0;
                    throw error;
                });
            if (!claimed) continue;
            try {
                const message = await this.mailService.send(
                    email,
                    exchangeNoticeDigestEmailTemplate,
                    {
                        notices: recipients.map(
                            ({ delivery }): ExchangeNoticeDigest =>
                                delivery.notice
                        ),
                        unsubscribeUrl: await this.unsubscribeUrl(userId),
                        preferencesUrl: new URL(
                            "/editais-de-intercambio",
                            this.config.frontendUrl
                        ).toString()
                    }
                );
                if (
                    !message.accepted.some(
                        (address) => address.trim().toLowerCase() === email
                    )
                )
                    throw new Error("SMTP did not accept recipient.");
                await this.prisma.exchangeNoticeDeliveryRecipient.updateMany({
                    where: { id: { in: ids }, status: "PROCESSING" },
                    data: {
                        status: "SENT",
                        sentAt: new Date(),
                        processingAt: null,
                        lastError: null
                    }
                });
                this.logger.info(
                    {
                        cycleId,
                        userId,
                        noticeCount: recipients.length,
                        messageId: message.messageId
                    },
                    "Digest enviado para um endereço de contato."
                );
            } catch (error) {
                for (const recipient of recipients) {
                    const waitMs = Math.min(
                        86400000,
                        60000 * 2 ** (recipient.attemptCount + 1)
                    );
                    await this.prisma.exchangeNoticeDeliveryRecipient.updateMany(
                        {
                            where: { id: recipient.id, status: "PROCESSING" },
                            data: {
                                status: "FAILED",
                                processingAt: null,
                                nextAttemptAt: new Date(Date.now() + waitMs),
                                lastError: "SMTP delivery failed"
                            }
                        }
                    );
                }
                this.logger.error(
                    {
                        cycleId,
                        userId,
                        noticeCount: recipients.length,
                        failureKind:
                            error instanceof Error ? error.name : "UnknownError"
                    },
                    "Falha de envio para um endereço de contato."
                );
            }
        }
        for (const delivery of deliveries) {
            const recipients =
                await this.prisma.exchangeNoticeDeliveryRecipient.findMany({
                    where: { deliveryId: delivery.id }
                });
            if (!recipients.length) continue;
            const unfinished = recipients.filter(
                ({ status }) => status !== "SENT"
            );
            const sent = unfinished.length === 0;
            await this.prisma.exchangeNoticeDelivery.update({
                where: { id: delivery.id },
                data: {
                    status: sent
                        ? "SENT"
                        : unfinished.some(({ status }) => status === "FAILED")
                          ? "FAILED"
                          : "PENDING",
                    sentAt: sent ? new Date() : null,
                    processingAt: null,
                    attemptCount: Math.max(
                        ...recipients.map(({ attemptCount }) => attemptCount)
                    ),
                    nextAttemptAt: sent
                        ? now
                        : new Date(
                              Math.min(
                                  ...unfinished.map(({ nextAttemptAt }) =>
                                      nextAttemptAt.getTime()
                                  )
                              )
                          ),
                    lastError: unfinished.some(
                        ({ status }) => status === "FAILED"
                    )
                        ? "One or more recipients failed"
                        : null
                }
            });
        }
    }

    private async unsubscribeUrl(userId: number) {
        const token = await new SignJWT({
            action: "exchange-notice-unsubscribe",
            identityVersion: 2
        })
            .setProtectedHeader({ alg: "HS256" })
            .setSubject(`${userId}`)
            .setIssuedAt()
            .setExpirationTime("180d")
            .sign(new TextEncoder().encode(this.config.unsubscribeSecret));
        const url = new URL(
            "/exchange-notice-subscriptions/unsubscribe",
            this.config.appApiUrl
        );
        url.searchParams.set("token", token);
        return url.toString();
    }
}

class RecipientClaimConflict extends Error {}
