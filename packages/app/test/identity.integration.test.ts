import { createStudentService } from "#/modules/student/Student.service.js";
import {
    backfillIdentities,
    canonicalIdentity,
    canonicalIdentityInclude,
    createCanonicalIdentity,
    createDatabaseClient,
    linkCanonicalStudent,
    localIdentityDatabaseUrl,
    runIdentityTransaction,
    type IdentityMapping
} from "@pomi/db";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const databaseUrl = process.env.POMI_IAM_TEST_DATABASE_URL;

test(
    "backfills explicit aliases without unioning permissions and preserves canonical invariants",
    { skip: !databaseUrl },
    async () => {
        const prisma = createDatabaseClient(
            localIdentityDatabaseUrl(databaseUrl)
        );
        const suffix = randomUUID();
        const student = await prisma.student.create({
            data: { ra: suffix, name: "Identity fixture" }
        });
        const create = (
            issuer: string,
            roles: Array<"STUDENT" | "ADMIN" | "BOT">,
            studentId: number | null = null
        ) =>
            prisma.authUser.create({
                data: {
                    issuer: `${issuer}/${suffix}`,
                    subject: suffix,
                    studentId,
                    roles: { create: roles.map((role) => ({ role })) }
                },
                include: { roles: true }
            });
        const old = await create("https://old.invalid", ["STUDENT"]);
        const current = await create(
            "https://current.invalid",
            ["STUDENT", "ADMIN"],
            student.id
        );
        const service = await create("https://service.invalid", ["BOT"]);
        const ids = [old.id, current.id, service.id];
        const mappings: IdentityMapping[] = [
            {
                canonicalAuthUserId: current.id,
                authUserIds: [old.id, current.id],
                expectedIdentities: [old, current].map(
                    ({ id, issuer, subject, studentId }) => ({
                        id,
                        issuer,
                        subject,
                        studentId
                    })
                )
            }
        ];
        try {
            const before = await prisma.principal.count();
            assert.equal(
                (await backfillIdentities(prisma, mappings)).apply,
                false
            );
            assert.equal(await prisma.principal.count(), before);
            assert.equal(
                (await backfillIdentities(prisma, mappings, true)).created,
                2
            );
            assert.equal(
                (await backfillIdentities(prisma, mappings, true)).created,
                0
            );
            const read = (id: number) =>
                prisma.authUser.findUniqueOrThrow({
                    where: { id },
                    include: { ...canonicalIdentityInclude, roles: true }
                });
            const left = await read(old.id);
            const right = await read(current.id);
            const principal = canonicalIdentity(left).principal;
            assert.equal(principal.id, canonicalIdentity(right).principal.id);
            assert.equal(principal.user?.studentId, student.id);
            assert.deepEqual(
                left.roles.map(({ role }) => role),
                ["STUDENT"]
            );
            assert.deepEqual(
                new Set(right.roles.map(({ role }) => role)),
                new Set(["STUDENT", "ADMIN"])
            );
            assert.equal(
                canonicalIdentity(await read(service.id)).principal.kind,
                "SERVICE"
            );
            await assert.rejects(
                backfillIdentities(prisma, [], true),
                /Shared student|Existing canonical/
            );
            const wrong = structuredClone(mappings);
            wrong[0].expectedIdentities[0].subject = "different";
            await assert.rejects(
                backfillIdentities(prisma, wrong, true),
                /inspected source/
            );
            await prisma.principal.update({
                where: { id: principal.id },
                data: { status: "DISABLED" }
            });
            await backfillIdentities(prisma, mappings, true);
            assert.equal(
                canonicalIdentity(await read(current.id)).principal.status,
                "DISABLED"
            );
            await prisma.authUser.update({
                where: { id: old.id },
                data: { status: "DISABLED" }
            });
            assert.equal((await read(current.id)).status, "ACTIVE");
            await assert.rejects(
                prisma.authIdentity.create({
                    data: {
                        issuer: old.issuer,
                        subject: old.subject,
                        principalId: principal.id,
                        legacyAuthUserId: service.id
                    }
                })
            );
            assert.ok(
                (
                    await createStudentService({ prisma }).remove(
                        student.id,
                        student.ra
                    )
                ).isOk()
            );
            assert.equal(
                canonicalIdentity(await read(current.id)).principal.user
                    ?.studentId,
                null
            );
            assert.equal((await read(current.id)).studentId, null);
        } finally {
            const identities = await prisma.authIdentity.findMany({
                where: { legacyAuthUserId: { in: ids } }
            });
            const principalIds = identities.map(
                ({ principalId }) => principalId
            );
            await prisma.authIdentity.deleteMany({
                where: { legacyAuthUserId: { in: ids } }
            });
            await prisma.user.deleteMany({
                where: { principalId: { in: principalIds } }
            });
            await prisma.serviceAccount.deleteMany({
                where: { principalId: { in: principalIds } }
            });
            await prisma.principal.deleteMany({
                where: { id: { in: principalIds } }
            });
            await prisma.authUser.deleteMany({ where: { id: { in: ids } } });
            await prisma.student.deleteMany({ where: { id: student.id } });
            await prisma.$disconnect();
        }
    }
);

test(
    "canonical provisioning retries concurrent identities and rolls back a failed association",
    { skip: !databaseUrl },
    async () => {
        const prisma = createDatabaseClient(
            localIdentityDatabaseUrl(databaseUrl)
        );
        const suffix = randomUUID();
        const issuer = `https://concurrent.invalid/${suffix}`;
        let authUserId: number | undefined;
        let studentId: number | undefined;
        try {
            const provision = () =>
                runIdentityTransaction(prisma, async (tx) => {
                    const existing = await tx.authUser.findUnique({
                        where: { issuer_subject: { issuer, subject: suffix } },
                        include: canonicalIdentityInclude
                    });
                    if (existing) return existing;
                    const created = await tx.authUser.create({
                        data: {
                            issuer,
                            subject: suffix,
                            roles: { create: { role: "STUDENT" } }
                        },
                        include: { roles: true }
                    });
                    await createCanonicalIdentity(tx, created);
                    return tx.authUser.findUniqueOrThrow({
                        where: { id: created.id },
                        include: canonicalIdentityInclude
                    });
                });
            const [left, right] = await Promise.all([provision(), provision()]);
            authUserId = left.id;
            assert.equal(left.id, right.id);
            assert.equal(
                canonicalIdentity(left).principal.id,
                canonicalIdentity(right).principal.id
            );
            await assert.rejects(
                runIdentityTransaction(prisma, async (tx) => {
                    const student = await tx.student.create({
                        data: { ra: suffix, name: "Rollback fixture" }
                    });
                    await linkCanonicalStudent(tx, left.id, student.id);
                    throw new Error("Abort association");
                }),
                /Abort association/
            );
            assert.equal(
                await prisma.student.count({ where: { ra: suffix } }),
                0
            );
            const unchanged = await prisma.authUser.findUniqueOrThrow({
                where: { id: left.id },
                include: canonicalIdentityInclude
            });
            assert.equal(
                canonicalIdentity(unchanged).principal.user?.studentId,
                null
            );
            const student = await prisma.student.create({
                data: { ra: suffix, name: "Link fixture" }
            });
            studentId = student.id;
            await runIdentityTransaction(prisma, async (tx) => {
                await linkCanonicalStudent(tx, left.id, student.id);
                await tx.authUser.update({
                    where: { id: left.id },
                    data: { studentId: student.id }
                });
            });
            const linked = await prisma.authUser.findUniqueOrThrow({
                where: { id: left.id },
                include: canonicalIdentityInclude
            });
            assert.equal(
                canonicalIdentity(linked).principal.user?.studentId,
                student.id
            );
        } finally {
            if (authUserId) {
                const identity = await prisma.authIdentity.findUniqueOrThrow({
                    where: { legacyAuthUserId: authUserId }
                });
                await prisma.authIdentity.delete({
                    where: { id: identity.id }
                });
                await prisma.user.deleteMany({
                    where: { principalId: identity.principalId }
                });
                await prisma.principal.delete({
                    where: { id: identity.principalId }
                });
                await prisma.authUser.delete({ where: { id: authUserId } });
            }
            if (studentId)
                await prisma.student.delete({ where: { id: studentId } });
            await prisma.$disconnect();
        }
    }
);

test(
    "bootstrap and administrative writes maintain canonical accounts without changing their kind",
    { skip: !databaseUrl },
    async () => {
        process.env.DISABLED_AUTH = "true";
        const { ensureAdministratorIdentity } = await import("@pomi/db");
        const { createAuthUserService } =
            await import("#/modules/identity/auth-user/AuthUser.service.js");
        const { resolvePrincipal } = await import("#/auth.js");
        const prisma = createDatabaseClient(
            localIdentityDatabaseUrl(databaseUrl)
        );
        const issuer = `https://admin.invalid/${randomUUID()}`;
        try {
            const admin = await ensureAdministratorIdentity(
                prisma,
                issuer,
                "admin"
            );
            await ensureAdministratorIdentity(prisma, issuer, "admin");
            const actor = await resolvePrincipal(
                { iss: issuer, sub: "admin" },
                { prisma } as never
            );
            assert.equal(actor.authUserId, admin.id);
            assert.equal(actor.studentId, null);
            assert.ok(actor.userId);
            const service = createAuthUserService({ prisma });
            const bot = await service.create(actor, {
                subject: "bot",
                displayName: "Fixture service",
                capabilities: ["ACADEMIC_WRITE"]
            });
            const read = (id: number) =>
                prisma.authUser.findUniqueOrThrow({
                    where: { id },
                    include: canonicalIdentityInclude
                });
            const machine = canonicalIdentity(await read(bot.id));
            assert.equal(machine.principal.kind, "SERVICE");
            assert.equal(
                machine.principal.serviceAccount?.name,
                "Fixture service"
            );
            await service.patch(bot.id, {
                status: "DISABLED",
                displayName: "Renamed service",
                capabilities: []
            });
            assert.equal(
                canonicalIdentity(await read(bot.id)).principal.serviceAccount
                    ?.name,
                "Renamed service"
            );
            await assert.rejects(
                resolvePrincipal({ iss: issuer, sub: "bot" }, {
                    prisma
                } as never),
                /Forbidden/
            );
            await service.create(actor, {
                subject: "bot",
                displayName: "Reactivated service",
                capabilities: []
            });
            assert.equal((await read(bot.id)).status, "ACTIVE");
            await service.create(actor, {
                subject: "admin",
                displayName: "Still human",
                capabilities: []
            });
            assert.equal(
                canonicalIdentity(await read(admin.id)).principal.kind,
                "HUMAN"
            );
            const result = await service.patch(admin.id, {
                status: "DISABLED"
            });
            assert.equal(result.isErr(), true);
            await prisma.principal.update({
                where: { id: machine.principal.id },
                data: { status: "DISABLED" }
            });
            await assert.rejects(
                resolvePrincipal({ iss: issuer, sub: "bot" }, {
                    prisma
                } as never),
                /Forbidden/
            );
        } finally {
            const identities = await prisma.authIdentity.findMany({
                where: { issuer }
            });
            const ids = identities.map(({ principalId }) => principalId);
            await prisma.authIdentity.deleteMany({ where: { issuer } });
            await prisma.user.deleteMany({
                where: { principalId: { in: ids } }
            });
            await prisma.serviceAccount.deleteMany({
                where: { principalId: { in: ids } }
            });
            await prisma.principal.deleteMany({ where: { id: { in: ids } } });
            await prisma.authUser.deleteMany({ where: { issuer } });
            await prisma.$disconnect();
        }
    }
);

test(
    "explicit student registration and deletion synchronize both identity models",
    { skip: !databaseUrl },
    async () => {
        process.env.DISABLED_AUTH = "true";
        const { resolvePrincipal } = await import("#/auth.js");
        const { createStudentService } =
            await import("#/modules/student/Student.service.js");
        const prisma = createDatabaseClient(
            localIdentityDatabaseUrl(databaseUrl)
        );
        const issuer = `https://student.invalid/${randomUUID()}`;
        const ra = "990001";
        let id: number | undefined;
        try {
            const account = await runIdentityTransaction(prisma, async (tx) => {
                const created = await tx.authUser.create({
                    data: {
                        issuer,
                        subject: "student",
                        email: `s${ra}@dac.unicamp.br`,
                        roles: { create: { role: "STUDENT" } }
                    },
                    include: { roles: true }
                });
                await createCanonicalIdentity(tx, created);
                return created;
            });
            id = account.id;
            const payload = {
                iss: issuer,
                sub: "student",
                email: `s${ra}@dac.unicamp.br`
            };
            const actor = await resolvePrincipal(payload, { prisma } as never, {
                provisionStudent: false
            });
            const service = createStudentService({ prisma });
            const result = await service.create(actor, {
                name: "Registration fixture"
            });
            assert.ok(result.isOk());
            const studentId = result.value.student.id;
            const linked = await prisma.authUser.findUniqueOrThrow({
                where: { id },
                include: canonicalIdentityInclude
            });
            assert.equal(linked.studentId, studentId);
            assert.equal(
                canonicalIdentity(linked).principal.user?.studentId,
                studentId
            );
            assert.ok((await service.remove(studentId, ra)).isOk());
            const removed = await prisma.authUser.findUniqueOrThrow({
                where: { id },
                include: canonicalIdentityInclude
            });
            assert.equal(removed.studentId, null);
            assert.equal(
                canonicalIdentity(removed).principal.user?.studentId,
                null
            );
            const existing = await prisma.student.create({
                data: { ra, name: "Existing fixture" }
            });
            const relink = await service.create(actor, {
                name: "Ignored for existing student"
            });
            assert.ok(relink.isOk());
            assert.equal(relink.value.student.id, existing.id);
            assert.equal(relink.value.linked, true);
            assert.ok((await service.remove(existing.id, ra)).isOk());
        } finally {
            if (id) {
                const identity = await prisma.authIdentity.findUniqueOrThrow({
                    where: { legacyAuthUserId: id }
                });
                await prisma.authIdentity.delete({
                    where: { id: identity.id }
                });
                await prisma.user.deleteMany({
                    where: { principalId: identity.principalId }
                });
                await prisma.principal.delete({
                    where: { id: identity.principalId }
                });
                await prisma.authUser.delete({ where: { id } });
            }
            await prisma.student.deleteMany({ where: { ra } });
            await prisma.$disconnect();
        }
    }
);

test(
    "concurrent first logins create a single canonical human and student",
    { skip: !databaseUrl },
    async () => {
        process.env.DISABLED_AUTH = "true";
        const { resolvePrincipal } = await import("#/auth.js");
        const prisma = createDatabaseClient(
            localIdentityDatabaseUrl(databaseUrl)
        );
        const issuer = `https://login.invalid/${randomUUID()}`;
        const ra = "990002";
        const payload = {
            iss: issuer,
            sub: "new-person",
            email: `s${ra}@dac.unicamp.br`,
            name: "Login fixture"
        };
        try {
            const [left, right] = await Promise.all([
                resolvePrincipal(payload, { prisma } as never),
                resolvePrincipal(payload, { prisma } as never)
            ]);
            assert.equal(left.authUserId, right.authUserId);
            assert.equal(left.principalId, right.principalId);
            assert.equal(left.userId, right.userId);
            assert.equal(left.studentId, right.studentId);
            assert.ok(left.studentId);
            assert.equal(await prisma.authUser.count({ where: { issuer } }), 1);
            assert.equal(await prisma.student.count({ where: { ra } }), 1);
            const account = await prisma.authUser.findUniqueOrThrow({
                where: { id: left.authUserId },
                include: canonicalIdentityInclude
            });
            assert.equal(
                canonicalIdentity(account).principal.user?.studentId,
                left.studentId
            );
        } finally {
            const identities = await prisma.authIdentity.findMany({
                where: { issuer }
            });
            const ids = identities.map(({ principalId }) => principalId);
            await prisma.authIdentity.deleteMany({ where: { issuer } });
            await prisma.user.deleteMany({
                where: { principalId: { in: ids } }
            });
            await prisma.principal.deleteMany({ where: { id: { in: ids } } });
            await prisma.authUser.deleteMany({ where: { issuer } });
            await prisma.student.deleteMany({ where: { ra } });
            await prisma.$disconnect();
        }
    }
);
