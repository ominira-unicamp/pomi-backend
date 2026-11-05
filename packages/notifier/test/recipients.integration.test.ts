import type { NotifierConfig } from "#/Config.js";
import { MailService } from "#/email/MailService.js";
import type { SendEmailInput } from "#/email/smtp.js";
import { ExchangeNoticeNotifier } from "#/modules/exchange/ExchangeNoticeNotifier.js";
import { createDatabaseClient } from "@pomi/db";
import { jwtVerify } from "jose";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pino from "pino";

const databaseUrl = process.env.POMI_NOTIFIER_TEST_DATABASE_URL;

test(
    "notifies every contact independently and retries only failed recipients without replaying history",
    {
        skip: !databaseUrl,
        timeout: 60000
    },
    async () => {
        const url = new URL(databaseUrl!);
        assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
        assert.ok(url.pathname.endsWith("_test"));
        assert.notEqual(url.port, "5433");
        const prisma = createDatabaseClient(databaseUrl!, { max: 1 });
        const tag = randomUUID();
        const config: NotifierConfig = {
            databaseUrl: databaseUrl!,
            appApiUrl: "https://app.example.test",
            frontendUrl: "https://example.test",
            unsubscribeSecret: "x".repeat(32),
            cron: "0 */6 * * *",
            pollIntervalMs: 5000,
            maxAttempts: 3,
            smtpHost: "unused.example.test",
            smtpPort: 587,
            smtpUser: "unused",
            smtpPass: "unused",
            smtpFrom: "noreply@example.test",
            logLevel: "silent"
        };
        const sent: SendEmailInput[] = [];
        let rejectSecond = true;
        const mail = new MailService(config, {
            sendMail: async (input) => {
                sent.push(input);
                assert.equal(typeof input.to, "string");
                const address = String(input.to);
                const rejected =
                    rejectSecond && address === "second@example.test";
                return {
                    messageId: randomUUID(),
                    accepted: rejected ? [] : [address],
                    rejected: rejected ? [address] : []
                };
            }
        });
        let principalId: number | undefined;
        let userId: number | undefined;
        const notices: number[] = [];
        try {
            assert.equal(
                await prisma.exchangeNoticeSubscription.count({
                    where: { enabled: true }
                }),
                0,
                "This test requires an exclusive local notifier database."
            );
            const principal = await prisma.principal.create({
                data: {
                    kind: "HUMAN",
                    user: {
                        create: {
                            name: "User without academic profile",
                            emails: {
                                create: [
                                    { email: "first@example.test" },
                                    { email: "second@example.test" }
                                ]
                            }
                        }
                    }
                },
                include: { user: true }
            });
            principalId = principal.id;
            userId = principal.user!.id;
            assert.equal(principal.user!.studentId, null);
            await prisma.exchangeNoticeSubscription.create({
                data: { userId, enabled: true }
            });
            for (const kind of ["pending", "historical"]) {
                const notice = await prisma.exchangeNotice.create({
                    data: {
                        naturalKey: `${tag}-${kind}`,
                        title: `${kind}-${tag}`,
                        registrationEnd: new Date(Date.now() + 86400000)
                    }
                });
                notices.push(notice.id);
            }
            const history = await prisma.exchangeNoticeDelivery.create({
                data: {
                    userId,
                    noticeId: notices[1]!,
                    status: "SENT",
                    sentAt: new Date(),
                    attemptCount: 1
                }
            });
            const notifier = new ExchangeNoticeNotifier(
                prisma,
                config,
                pino({ level: "silent" }),
                mail
            );
            await notifier.run();
            assert.deepEqual(sent.map(({ to }) => to).sort(), [
                "first@example.test",
                "second@example.test"
            ]);
            assert.ok(
                sent.every(({ text }) => !text.includes(`historical-${tag}`))
            );
            const delivery =
                await prisma.exchangeNoticeDelivery.findUniqueOrThrow({
                    where: {
                        userId_noticeId: { userId, noticeId: notices[0]! }
                    },
                    include: { recipients: true }
                });
            assert.equal(delivery.status, "FAILED");
            assert.equal(delivery.recipients.length, 2);
            assert.equal(
                delivery.recipients.find(
                    ({ email }) => email === "first@example.test"
                )!.status,
                "SENT"
            );
            assert.equal(
                delivery.recipients.find(
                    ({ email }) => email === "second@example.test"
                )!.status,
                "FAILED"
            );
            assert.equal(
                await prisma.exchangeNoticeDeliveryRecipient.count({
                    where: { deliveryId: history.id }
                }),
                0
            );
            const past = new Date(Date.now() - 1000);
            await prisma.exchangeNoticeDeliveryRecipient.updateMany({
                where: { deliveryId: delivery.id, status: "FAILED" },
                data: { nextAttemptAt: past }
            });
            await prisma.exchangeNoticeDelivery.update({
                where: { id: delivery.id },
                data: { nextAttemptAt: past }
            });
            rejectSecond = false;
            await notifier.run();
            assert.deepEqual(
                sent.map(({ to }) => to),
                [
                    "first@example.test",
                    "second@example.test",
                    "second@example.test"
                ]
            );
            assert.equal(
                (
                    await prisma.exchangeNoticeDelivery.findUniqueOrThrow({
                        where: { id: delivery.id }
                    })
                ).status,
                "SENT"
            );
            const attempts =
                await prisma.exchangeNoticeDeliveryRecipient.findMany({
                    where: { deliveryId: delivery.id },
                    orderBy: { email: "asc" }
                });
            assert.deepEqual(
                attempts.map(({ attemptCount }) => attemptCount),
                [1, 2]
            );
            const unsubscribe = sent[0]!.headers!["List-Unsubscribe"]!.slice(
                1,
                -1
            );
            assert.equal(
                new URL(unsubscribe).pathname,
                `/users/${userId}/exchange-notice-subscription/unsubscribe`
            );
            const token = new URL(unsubscribe).searchParams.get("token")!;
            const { payload } = await jwtVerify(
                token,
                new TextEncoder().encode(config.unsubscribeSecret)
            );
            assert.equal(payload.sub, String(userId));
            assert.equal(payload.identityVersion, 2);
            await prisma.userEmail.create({
                data: { userId, email: "later@example.test" }
            });
            await notifier.run();
            assert.equal(sent.length, 3);
        } finally {
            if (userId) {
                await prisma.exchangeNoticeDelivery.deleteMany({
                    where: { userId }
                });
                await prisma.exchangeNoticeSubscription.deleteMany({
                    where: { userId }
                });
                await prisma.user.delete({ where: { id: userId } });
            }
            if (principalId)
                await prisma.principal.delete({ where: { id: principalId } });
            await prisma.exchangeNotice.deleteMany({
                where: { id: { in: notices } }
            });
            await prisma.$disconnect();
        }
    }
);
