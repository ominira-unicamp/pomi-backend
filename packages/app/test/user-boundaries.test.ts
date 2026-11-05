import { createExchangeNoticeUnsubscribeService } from "#/modules/exchange/exchange-notice-unsubscribe/ExchangeNoticeUnsubscribe.service.js";
import { createStudentAbsenceService } from "#/modules/planning/student-absence/StudentAbsence.service.js";
import { SignJWT } from "jose";
import assert from "node:assert/strict";
import test from "node:test";

process.env.DISABLED_AUTH = "true";

test("unsubscribe proof authorizes the explicit path user and never selects another target", async () => {
    const secret = "local-test-unsubscribe-secret-long-enough";
    let changes = 0;
    const service = createExchangeNoticeUnsubscribeService({
        config: { notifierUnsubscribeSecret: secret } as never,
        prisma: {
            user: { findUnique: async () => ({ id: 117 }) },
            exchangeNoticeSubscription: {
                updateMany: async ({
                    where
                }: {
                    where: { userId: number };
                }) => {
                    assert.equal(where.userId, 117);
                    changes++;
                    return { count: 1 };
                }
            }
        } as never
    });
    const proof = (identityVersion?: number) =>
        new SignJWT({
            action: "exchange-notice-unsubscribe",
            ...(identityVersion === undefined ? {} : { identityVersion })
        })
            .setProtectedHeader({ alg: "HS256" })
            .setSubject(identityVersion === 2 ? "117" : "9")
            .setExpirationTime("5m")
            .sign(new TextEncoder().encode(secret));
    await assert.rejects(
        service.unsubscribe(118, await proof(2)),
        /Forbidden|autoriza/
    );
    await assert.rejects(
        service.unsubscribe(118, await proof()),
        /Forbidden|autoriza/
    );
    await assert.rejects(
        service.unsubscribe(117, "invalid"),
        /Forbidden|inválido/
    );
    await assert.rejects(
        service.unsubscribe(117, await proof(3)),
        /Forbidden|inválido/
    );
    assert.equal(changes, 0);
    await service.unsubscribe(117, await proof(2));
    await service.unsubscribe(117, await proof());
    assert.equal(changes, 2);
});

test("nested absences reject an attempt outside the explicit user before reading records", async () => {
    const service = createStudentAbsenceService({
        prisma: {
            studentCourseAttempt: {
                findFirst: async ({
                    where
                }: {
                    where: { id: number; userId: number };
                }) => {
                    assert.deepEqual(where, { id: 41, userId: 117 });
                    return null;
                }
            },
            studentAbsence: {
                findMany: async () =>
                    assert.fail("must not read foreign absences")
            }
        } as never
    });
    await assert.rejects(service.list(117, {}, 41), /não encontrado/);
});
