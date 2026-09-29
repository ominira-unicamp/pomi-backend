import assert from "node:assert/strict";
import test from "node:test";

process.env.DISABLED_AUTH = "true";

test("student social contracts protect reads and writes with social capabilities", async () => {
    const [{ default: contracts }, { StudentCapabilities }] = await Promise.all(
        [
            import("#/modules/social/student-social/StudentSocial.contract.js"),
            import("#/Authorization.js")
        ]
    );

    assert.deepEqual(contracts.getProfile.meta.authorization, {
        kind: "student-access",
        studentParam: "sid",
        capability: StudentCapabilities.SOCIAL_READ
    });
    assert.deepEqual(contracts.createFriendship.meta.authorization, {
        kind: "student-access",
        studentParam: "sid",
        capability: StudentCapabilities.SOCIAL_WRITE
    });
});

test("student social input allows directory listings and validates public ids", async () => {
    const { default: contracts } =
        await import("#/modules/social/student-social/StudentSocial.contract.js");

    assert.equal(
        contracts.listPeople.request.safeParse({
            path: { sid: "1" },
            query: {}
        }).success,
        true
    );
    assert.equal(
        contracts.listPeople.request.safeParse({
            path: { sid: "1" },
            query: { query: "ab" }
        }).success,
        true
    );
    assert.equal(
        contracts.createFriendship.request.safeParse({
            path: { sid: "1" },
            body: { targetPublicId: "not-a-uuid" }
        }).success,
        false
    );
    assert.equal(
        contracts.updateProfile.request.safeParse({
            path: { sid: "1" },
            body: {
                enabled: true,
                currentCoursesVisibility: "FRIENDS"
            }
        }).success,
        true
    );
    assert.equal(
        contracts.updateProfile.request.safeParse({
            path: { sid: "1" },
            body: { showProgram: true }
        }).success,
        false
    );
});

test("student social directory lists every active public profile without a query", async () => {
    const { createStudentSocialService } =
        await import("#/modules/social/student-social/StudentSocial.service.js");
    let where: unknown;
    const service = createStudentSocialService({
        prisma: {
            student: {
                findMany: async (input: { where: unknown }) => {
                    where = input.where;
                    return [];
                },
                count: async () => 0
            }
        }
    } as never);

    const result = await service.listPeople(7, { page: 1, pageSize: 20 });

    assert.deepEqual(where, {
        id: { not: 7 },
        publicProfileEnabled: true,
        authUsers: { some: { status: "ACTIVE" } }
    });
    assert.deepEqual(result.items, []);
});

test("student social current course visibility follows public and friendship access", async () => {
    const { createStudentSocialService } =
        await import("#/modules/social/student-social/StudentSocial.service.js");
    const student = {
        id: 8,
        publicId: "a375fdb0-45d9-4a79-8415-89fcb64157b6",
        name: "Ada Lovelace",
        publicProfileEnabled: true,
        publicDisplayName: null,
        publicBio: null,
        currentCoursesVisibility: "FRIENDS" as const,
        entryYear: 2026,
        tagInterests: [],
        courseAttempts: [
            {
                course: { code: "MC102", name: "Algoritmos e Programação" },
                class: {
                    code: "A",
                    classSchedules: [
                        {
                            id: 31,
                            dayOfWeek: "MONDAY" as const,
                            start: "08:00",
                            end: "10:00",
                            room: { code: "CB02" }
                        }
                    ]
                }
            }
        ],
        program: null,
        specialization: null
    };
    let friendship: { id: number } | null = null;
    const service = createStudentSocialService({
        prisma: {
            student: { findFirst: async () => student },
            studentFriendship: {
                findFirst: async () => friendship
            }
        }
    } as never);

    const withoutFriendship = await service.getPerson(7, student.publicId);
    assert.equal(withoutFriendship.isOk(), true);
    assert.deepEqual(withoutFriendship._unsafeUnwrap().currentCourses, []);

    friendship = { id: 1 };
    const withFriendship = await service.getPerson(7, student.publicId);
    assert.deepEqual(withFriendship._unsafeUnwrap().currentCourses, [
        {
            courseCode: "MC102",
            courseName: "Algoritmos e Programação",
            classCode: "A",
            schedules: [
                {
                    id: 31,
                    dayOfWeek: "MONDAY",
                    start: "08:00",
                    end: "10:00",
                    roomCode: "CB02"
                }
            ]
        }
    ]);
});
