import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createDatabaseClient } from "../src/PrismaClient.js";
import {
    backfillUserOwnership,
    normalizeUserEmail
} from "../src/userOwnershipBackfill.js";

const databaseUrl = process.env.POMI_USER_EXPANSION_TEST_DATABASE_URL;

test("normalizes contacts without changing provider-specific address syntax", () => {
    assert.equal(
        normalizeUserEmail(" A.B+tag@Example.COM "),
        "a.b+tag@example.com"
    );
});

test(
    "backfills expansion data atomically, preserves legacy resources and remains idempotent",
    {
        skip: !databaseUrl
    },
    async () => {
        const url = new URL(databaseUrl!);
        assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
        assert.ok(url.pathname.endsWith("_test"));
        assert.notEqual(url.port, "5433");
        assert.equal(url.search, "");
        const prisma = createDatabaseClient(databaseUrl!);
        const token = randomUUID();
        const students: number[] = [];
        const principals: number[] = [];
        const authUsers: number[] = [];
        let curriculumId: number | undefined;
        let friendshipId: number | undefined;
        const reports: number[] = [];
        try {
            const offset = await prisma.principal.create({
                data: {
                    kind: "HUMAN",
                    user: { create: { name: "Account without student" } }
                },
                include: { user: true }
            });
            principals.push(offset.id);
            const first = await prisma.student.create({
                data: { ra: `first-${token}`, name: "Academic name" }
            });
            const orphan = await prisma.student.create({
                data: { ra: `orphan-${token}`, name: "Orphan academic record" }
            });
            students.push(first.id, orphan.id);
            const existing = await prisma.principal.create({
                data: {
                    kind: "HUMAN",
                    user: {
                        create: {
                            studentId: first.id,
                            name: "Canonical account name"
                        }
                    }
                },
                include: { user: true }
            });
            principals.push(existing.id);
            assert.notEqual(existing.user!.id, first.id);
            for (const [index, email] of [
                " Person+tag@Example.com ",
                "person+tag@example.com"
            ].entries()) {
                const issuer = `https://${index}.example.invalid`;
                const [auth] = await prisma.$queryRaw<Array<{ id: number }>>`
                    INSERT INTO app."AuthUser" (issuer, subject, email, status, "updatedAt")
                    VALUES (${issuer}, ${token}, ${email}, ${index === 0 ? "ACTIVE" : "DISABLED"}::app."AuthUserStatus", now()) RETURNING id
                `;
                authUsers.push(auth!.id);
                await prisma.$executeRaw`
                    INSERT INTO app."AuthIdentity" (issuer, subject, "legacyAuthUserId", "principalId", "updatedAt")
                    VALUES (${issuer}, ${token}, ${auth!.id}, ${existing.id}, now())
                `;
            }
            await prisma.$executeRaw`UPDATE app."Student" SET "publicBio" = 'preserved bio',
            "publicDisplayName" = 'Preserved public name', "publicProfileEnabled" = true WHERE id = ${first.id}`;
            const [curriculum] = await prisma.$queryRaw<Array<{ id: number }>>`
            INSERT INTO app."Curriculum" ("studentId", name, "updatedAt")
            VALUES (${first.id}, 'Preserved curriculum', CURRENT_TIMESTAMP) RETURNING id
        `;
            curriculumId = curriculum!.id;
            await prisma.$executeRaw`UPDATE app."Student" SET "favoriteCurriculumId" = ${curriculumId} WHERE id = ${first.id}`;
            const [friendship] = await prisma.$queryRaw<Array<{ id: number }>>`
            INSERT INTO app."StudentFriendship" ("studentAId", "studentBId", "requestedById", status, "updatedAt")
            VALUES (${first.id}, ${orphan.id}, ${orphan.id}, 'PENDING', CURRENT_TIMESTAMP) RETURNING id
        `;
            friendshipId = friendship!.id;
            for (const reporter of [first.id, null]) {
                const [report] = await prisma.$queryRaw<Array<{ id: number }>>`
                INSERT INTO app."FeedbackReport" (kind, "targetType", title, description, "reporterStudentId", "updatedAt")
                VALUES ('BUG', 'GENERAL', 'Fixture report', 'Fixture content', ${reporter}, CURRENT_TIMESTAMP) RETURNING id
            `;
                reports.push(report!.id);
            }
            const before = await prisma.$queryRaw<Array<{ value: unknown }>>`
            SELECT row_to_json(s) AS value FROM app."Student" s WHERE id IN (${first.id}, ${orphan.id}) ORDER BY id
        `;
            const usersBefore = await prisma.user.count();
            const dry = await backfillUserOwnership(prisma);
            assert.equal(dry.apply, false);
            assert.equal(dry.createdUsers, 1);
            assert.equal(await prisma.user.count(), usersBefore);
            await assert.rejects(
                backfillUserOwnership(prisma, {
                    apply: true,
                    expectedSourceDigest: "stale"
                }),
                /Source changed/
            );
            const applied = await backfillUserOwnership(prisma, {
                apply: true,
                expectedSourceDigest: dry.sourceDigest
            });
            assert.equal(applied.createdUsers, 1);
            const migrated = await prisma.user.findUniqueOrThrow({
                where: { studentId: orphan.id }
            });
            principals.push(migrated.principalId);
            const owner = await prisma.user.findUniqueOrThrow({
                where: { studentId: first.id }
            });
            assert.equal(owner.publicBio, "preserved bio");
            assert.equal(owner.publicDisplayName, "Preserved public name");
            assert.equal(owner.name, "Canonical account name");
            assert.equal(owner.favoriteCurriculumId, curriculumId);
            assert.equal(
                (
                    await prisma.curriculum.findUniqueOrThrow({
                        where: { id: curriculumId }
                    })
                ).userId,
                owner.id
            );
            const link = await prisma.studentFriendship.findUniqueOrThrow({
                where: { id: friendshipId }
            });
            assert.equal(link.userAId, Math.min(owner.id, migrated.id));
            assert.equal(link.userBId, Math.max(owner.id, migrated.id));
            assert.equal(link.requestedByUserId, migrated.id);
            const contacts = await prisma.userEmail.findMany({
                where: { userId: owner.id }
            });
            assert.deepEqual(
                contacts.map(({ email, verifiedAt }) => ({
                    email,
                    verifiedAt
                })),
                [{ email: "person+tag@example.com", verifiedAt: null }]
            );
            assert.equal(
                await prisma.authIdentity.count({
                    where: { principalId: migrated.principalId }
                }),
                0
            );
            assert.equal(
                (
                    await prisma.feedbackReport.findUniqueOrThrow({
                        where: { id: reports[0] }
                    })
                ).reporterUserId,
                owner.id
            );
            assert.equal(
                (
                    await prisma.feedbackReport.findUniqueOrThrow({
                        where: { id: reports[1] }
                    })
                ).reporterUserId,
                null
            );
            const after = await prisma.$queryRaw<Array<{ value: unknown }>>`
            SELECT row_to_json(s) AS value FROM app."Student" s WHERE id IN (${first.id}, ${orphan.id}) ORDER BY id
        `;
            assert.deepEqual(after, before);
            const repeated = await backfillUserOwnership(prisma, {
                apply: true
            });
            assert.equal(repeated.createdUsers, 0);
            assert.equal(repeated.copiedProfiles, 0);
            assert.equal(await prisma.user.count(), usersBefore + 1);
            const offsetAfter = await prisma.user.findUniqueOrThrow({
                where: { id: offset.user!.id }
            });
            assert.equal(offsetAfter.studentId, null);
            await prisma.$executeRaw`UPDATE app."Curriculum" SET "userId" = ${offsetAfter.id} WHERE id = ${curriculumId}`;
            await assert.rejects(
                backfillUserOwnership(prisma, { apply: true }),
                /Invalid user ownership/
            );
        } finally {
            await prisma.feedbackReport.deleteMany({
                where: { id: { in: reports } }
            });
            if (friendshipId)
                await prisma.studentFriendship.deleteMany({
                    where: { id: friendshipId }
                });
            await prisma.user.updateMany({
                where: { principalId: { in: principals } },
                data: { favoriteCurriculumId: null }
            });
            if (curriculumId)
                await prisma.curriculum.deleteMany({
                    where: { id: curriculumId }
                });
            for (const id of authUsers) {
                await prisma.$executeRaw`DELETE FROM app."AuthIdentity" WHERE "legacyAuthUserId"=${id}`;
                await prisma.$executeRaw`DELETE FROM app."AuthUser" WHERE id=${id}`;
            }
            await prisma.user.deleteMany({
                where: { principalId: { in: principals } }
            });
            await prisma.principal.deleteMany({
                where: { id: { in: principals } }
            });
            await prisma.student.deleteMany({
                where: { id: { in: students } }
            });
            await prisma.$disconnect();
        }
    }
);
