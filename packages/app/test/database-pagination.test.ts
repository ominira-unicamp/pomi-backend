process.env.DISABLED_AUTH ??= "true";
const { createGroupEventService } =
    await import("#/modules/group/event/GroupEvent.service.js");
const { createGroupInvitationService } =
    await import("#/modules/group/invitation/GroupInvitation.service.js");
const { createGroupMembershipService } =
    await import("#/modules/group/membership/GroupMembership.service.js");
const { createBotGrantService } =
    await import("#/modules/identity/bot-grant/BotGrant.service.js");
const { createPeriodPlanService } =
    await import("#/modules/planning/period-plan/PeriodPlan.service.js");
const { createStudentAbsenceService } =
    await import("#/modules/planning/student-absence/StudentAbsence.service.js");
const { createStudentCourseAttemptService } =
    await import("#/modules/planning/student-course-attempt/StudentCourseAttempt.service.js");
const { createSocialFriendshipService } =
    await import("#/modules/social/friendship/SocialFriendship.service.js");
import type { PageResult, PaginationQuery } from "@pomi/api-core";
import type { PrismaClient } from "@pomi/db";
import assert from "node:assert/strict";
import test from "node:test";

const cases: Array<
    [
        string,
        unknown,
        (
            prisma: PrismaClient,
            query: PaginationQuery
        ) => Promise<PageResult<unknown>>
    ]
> = [
    [
        "studentCourseAttempt",
        { AND: [{ userId: 7 }] },
        (prisma, query) =>
            createStudentCourseAttemptService({ prisma }).list(7, query)
    ],
    [
        "studentAbsence",
        { AND: [{ studentCourseAttempt: { userId: 7 } }] },
        (prisma, query) =>
            createStudentAbsenceService({ prisma }).list(7, query)
    ],
    [
        "studentFriendship",
        { AND: [{ OR: [{ userAId: 7 }, { userBId: 7 }] }] },
        (prisma, query) =>
            createSocialFriendshipService({
                prisma,
                clock: { now: () => new Date() }
            }).listFriendships(7, query)
    ],
    [
        "periodPlanning",
        { userId: 7 },
        (prisma, query) => createPeriodPlanService({ prisma }).list(7, query)
    ],
    [
        "groupMembership",
        { userId: 7, groupId: 42 },
        (prisma, query) =>
            createGroupMembershipService({ prisma }).listOwnMemberships(
                7,
                42,
                query
            )
    ],
    [
        "groupInvitation",
        { recipientUserId: 7, groupId: 42 },
        (prisma, query) =>
            createGroupInvitationService({ prisma }).listInvitations(
                7,
                42,
                query
            )
    ],
    [
        "groupEvent",
        { groupId: 42, status: "PUBLISHED", group: { status: "ACTIVE" } },
        (prisma, query) =>
            createGroupEventService({ prisma }).listPublicEvents(42, query)
    ],
    [
        "botGrant",
        { userId: 7 },
        (prisma, query) => createBotGrantService({ prisma }).list(7, query)
    ]
];

for (const [model, scope, list] of cases) {
    test(`${model} scopes both count and page in the database`, async () => {
        let find: Record<string, unknown> = {};
        let counted: unknown;
        const prisma = {
            [model]: {
                count: async ({ where }: { where: unknown }) => {
                    counted = where;
                    return 0;
                },
                findMany: async (args: Record<string, unknown>) => {
                    find = args;
                    return [];
                }
            }
        } as unknown as PrismaClient;
        const result = await list(prisma, { page: 2, pageSize: 3 });
        assert.deepEqual(counted, scope);
        assert.deepEqual(find.where, scope);
        assert.equal(find.skip, 3);
        assert.equal(find.take, 3);
        assert.deepEqual(result.items, []);
        assert.equal(result.total, 0);
        await list(prisma, {});
        assert.equal(Object.hasOwn(find, "skip"), false);
        assert.equal(Object.hasOwn(find, "take"), false);
    });
}

for (const admin of [false, true]) {
    test(`feedback ${admin ? "administration" : "author"} count respects the same visibility as its page`, async () => {
        const { createFeedbackReportService } =
            await import("#/modules/feedback/feedback-report/FeedbackReport.service.js");
        const { FeedbackRateLimiter } =
            await import("#/modules/feedback/feedback-report/Feedback.limiter.js");
        let counted: unknown;
        let find: Record<string, unknown> = {};
        const service = createFeedbackReportService({
            prisma: {
                feedbackReport: {
                    count: async ({ where }: { where: unknown }) => {
                        counted = where;
                        return 3;
                    },
                    findMany: async (args: Record<string, unknown>) => {
                        find = args;
                        return [];
                    }
                }
            } as never,
            feedbackRateLimiter: new FeedbackRateLimiter({
                maximum: 2,
                windowMilliseconds: 60
            })
        });
        const query = { page: 10, pageSize: 2 };
        const result = admin
            ? await service.listForAdmin(query)
            : await service.listForUser(7, query);
        assert.deepEqual(counted, admin ? {} : { reporterUserId: 7 });
        assert.deepEqual(find.where, counted);
        assert.equal(find.take, 2);
        assert.equal(find.skip, 18);
        assert.equal(result.total, 3);
    });
}
