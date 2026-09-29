import assert from "node:assert/strict";
import test from "node:test";

import sharedPeriodPlanContracts from "#/modules/planning/shared-period-plan/SharedPeriodPlan.contract.js";
import { createSharedPeriodPlanService } from "#/modules/planning/shared-period-plan/SharedPeriodPlan.service.js";

test("shared period plan contracts expose public and student routes", () => {
    assert.equal(
        sharedPeriodPlanContracts.listPublic.meta.authorization.kind,
        "public"
    );
    assert.equal(
        sharedPeriodPlanContracts.getPublic.meta.authorization.kind,
        "public"
    );
    assert.equal(
        sharedPeriodPlanContracts.listForStudent.meta.authorization.kind,
        "student-access"
    );
    assert.equal(
        sharedPeriodPlanContracts.getForStudent.meta.authorization.kind,
        "student-access"
    );
});

test("public shared period plan query only selects public plans", async () => {
    let where: unknown;
    const service = createSharedPeriodPlanService({
        prisma: {
            periodPlanning: {
                findMany: async (input: { where: unknown }) => {
                    where = input.where;
                    return [];
                },
                count: async () => 0
            }
        }
    } as never);

    await service.listPublic({
        page: 1,
        pageSize: 20,
        query: "plano",
        filter: [{ path: ["studyPeriodId"], operator: "eq", values: [12] }]
    });

    assert.deepEqual(where, {
        AND: [
            {
                visibility: "PUBLIC",
                OR: [
                    { name: { contains: "plano", mode: "insensitive" } },
                    {
                        student: {
                            publicProfileEnabled: true,
                            publicDisplayName: {
                                contains: "plano",
                                mode: "insensitive"
                            }
                        }
                    }
                ]
            },
            { studyPeriodId: { equals: 12 } }
        ]
    });
});

test("student shared query grants access only to public and accepted-friend plans", async () => {
    let where: { OR: unknown[] } | undefined;
    const service = createSharedPeriodPlanService({
        prisma: {
            periodPlanning: {
                findMany: async (input: { where: unknown }) => {
                    where = input.where as { OR: unknown[] };
                    return [];
                },
                count: async () => 0
            }
        }
    } as never);

    await service.listForStudent(7, { page: 1, pageSize: 20 });

    assert.ok(where);
    assert.equal(where.OR.length, 3);
    assert.deepEqual(where.OR[0], { visibility: "PUBLIC" });
    assert.deepEqual(where.OR[1], {
        visibility: "FRIENDS",
        student: {
            friendshipsAsA: {
                some: {
                    OR: [
                        { studentAId: 7, status: "ACCEPTED" },
                        { studentBId: 7, status: "ACCEPTED" }
                    ]
                }
            }
        }
    });
    assert.deepEqual(where.OR[2], {
        visibility: "FRIENDS",
        student: {
            friendshipsAsB: {
                some: {
                    OR: [
                        { studentAId: 7, status: "ACCEPTED" },
                        { studentBId: 7, status: "ACCEPTED" }
                    ]
                }
            }
        }
    });
});

test("student shared query can be scoped to a public profile owner", async () => {
    let where: unknown;
    const service = createSharedPeriodPlanService({
        prisma: {
            periodPlanning: {
                findMany: async (input: { where: unknown }) => {
                    where = input.where;
                    return [];
                },
                count: async () => 0
            }
        }
    } as never);

    await service.listForStudent(7, {
        page: 1,
        pageSize: 20,
        filter: [
            {
                path: ["ownerPublicId"],
                operator: "eq",
                values: ["a375fdb0-45d9-4a79-8415-89fcb64157b6"]
            }
        ]
    });

    assert.deepEqual(where, {
        AND: [
            {
                OR: [
                    { visibility: "PUBLIC" },
                    {
                        visibility: "FRIENDS",
                        student: {
                            friendshipsAsA: {
                                some: {
                                    OR: [
                                        { studentAId: 7, status: "ACCEPTED" },
                                        { studentBId: 7, status: "ACCEPTED" }
                                    ]
                                }
                            }
                        }
                    },
                    {
                        visibility: "FRIENDS",
                        student: {
                            friendshipsAsB: {
                                some: {
                                    OR: [
                                        { studentAId: 7, status: "ACCEPTED" },
                                        { studentBId: 7, status: "ACCEPTED" }
                                    ]
                                }
                            }
                        }
                    }
                ]
            },
            {
                student: {
                    publicId: {
                        equals: "a375fdb0-45d9-4a79-8415-89fcb64157b6"
                    }
                }
            }
        ]
    });
});
