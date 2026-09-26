import IO from "#/modules/exchange/exchange-notice-subscription/ExchangeNoticeSubscription.contract.js";
import { createExchangeNoticeSubscriptionService } from "#/modules/exchange/exchange-notice-subscription/ExchangeNoticeSubscription.service.js";
import assert from "node:assert/strict";
import test from "node:test";

test("validates exchange notice subscription updates", () => {
    assert.equal(
        IO.patch.request.safeParse({
            path: { sid: "1" },
            body: { enabled: true, placeIds: [2, 3] }
        }).success,
        true
    );
    assert.equal(
        IO.patch.request.safeParse({
            path: { sid: "1" },
            body: { placeIds: [2, 2] }
        }).success,
        false
    );
});

test("returns disabled defaults before a student configures notifications", async () => {
    const service = createExchangeNoticeSubscriptionService({
        prisma: {
            exchangeNoticeSubscription: {
                findUnique: async () => null
            }
        } as never
    });

    assert.deepEqual(await service.get(7), {
        studentId: 7,
        enabled: false,
        placeIds: []
    });
});

test("replaces the selected places when updating a subscription", async () => {
    const service = createExchangeNoticeSubscriptionService({
        prisma: {
            exchangePlace: {
                count: async () => 2
            },
            exchangeNoticeSubscription: {
                upsert: async ({
                    create,
                    update
                }: {
                    create: unknown;
                    update: unknown;
                }) => {
                    assert.deepEqual(create, {
                        studentId: 7,
                        enabled: true,
                        places: {
                            create: [{ placeId: 2 }, { placeId: 3 }]
                        }
                    });
                    assert.deepEqual(update, {
                        enabled: true,
                        places: {
                            deleteMany: {},
                            create: [{ placeId: 2 }, { placeId: 3 }]
                        }
                    });
                    return {
                        enabled: true,
                        places: [{ placeId: 2 }, { placeId: 3 }]
                    };
                }
            }
        } as never
    });

    const result = await service.patch(7, {
        enabled: true,
        placeIds: [2, 3]
    });

    assert.equal(result.isOk(), true);
    if (result.isOk())
        assert.deepEqual(result.value, {
            studentId: 7,
            enabled: true,
            placeIds: [2, 3]
        });
});
