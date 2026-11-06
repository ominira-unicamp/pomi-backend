import {
    canonicalIdentity,
    canonicalIdentityInclude,
    createCanonicalIdentity,
    createDatabaseClient,
    linkCanonicalStudent,
    localIdentityDatabaseUrl,
    runIdentityTransaction
} from "@pomi/db";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const databaseUrl = process.env.POMI_IAM_TEST_DATABASE_URL;

test(
    "multiple canonical credentials preserve individual privileges, aliases and blocking",
    { skip: !databaseUrl },
    async () => {
        process.env.DISABLED_AUTH = "true";
        const { resolvePrincipal } = await import("#/auth.js");
        const prisma = createDatabaseClient(
            localIdentityDatabaseUrl(databaseUrl)
        );
        const issuer = `https://credentials.invalid/${randomUUID()}`;
        let principalId: number | undefined;
        try {
            const ordinary = await runIdentityTransaction(prisma, (tx) =>
                createCanonicalIdentity(tx, {
                    issuer,
                    subject: "ordinary",
                    roles: [{ role: "STUDENT" }]
                })
            );
            principalId = ordinary.principalId;
            const elevated = await prisma.authIdentity.create({
                data: {
                    issuer,
                    subject: "elevated",
                    principalId,
                    roles: { create: { role: "ADMIN" } },
                    capabilities: { create: { capability: "ACADEMIC_WRITE" } }
                }
            });
            const request = { prisma } as never;
            const left = await resolvePrincipal(
                { iss: issuer, sub: "ordinary" },
                request
            );
            const right = await resolvePrincipal(
                { iss: issuer, sub: "elevated" },
                request
            );
            assert.equal(left.principalId, right.principalId);
            assert.equal(left.authIdentityId, ordinary.id);
            assert.equal(right.authIdentityId, elevated.id);
            assert.equal(left.roles.has("ADMIN"), false);
            assert.equal(left.capabilities.has("ACADEMIC_WRITE"), false);
            assert.equal(right.roles.has("ADMIN"), true);
            await prisma.authIdentity.update({
                where: { id: ordinary.id },
                data: { status: "DISABLED" }
            });
            await assert.rejects(
                resolvePrincipal({ iss: issuer, sub: "ordinary" }, request),
                /Forbidden/
            );
            assert.equal(
                (
                    await resolvePrincipal(
                        { iss: issuer, sub: "elevated" },
                        request
                    )
                ).roles.has("ADMIN"),
                true
            );
            await prisma.principal.update({
                where: { id: principalId },
                data: { status: "DISABLED" }
            });
            await assert.rejects(
                resolvePrincipal({ iss: issuer, sub: "elevated" }, request),
                /Forbidden/
            );
            await assert.rejects(
                resolvePrincipal({ iss: issuer, sub: "ordinary" }, request),
                /Forbidden/
            );
        } finally {
            await prisma.authIdentity.deleteMany({ where: { issuer } });
            if (principalId) {
                await prisma.user.deleteMany({ where: { principalId } });
                await prisma.principal.delete({ where: { id: principalId } });
            }
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
        let authIdentityId: number | undefined;
        let studentId: number | undefined;
        try {
            const provision = () =>
                runIdentityTransaction(prisma, async (tx) => {
                    const existing = await tx.authIdentity.findUnique({
                        where: { issuer_subject: { issuer, subject: suffix } },
                        include: canonicalIdentityInclude
                    });
                    if (existing) return existing;
                    return createCanonicalIdentity(tx, {
                        issuer,
                        subject: suffix,
                        roles: [{ role: "STUDENT" }]
                    });
                });
            const [left, right] = await Promise.all([provision(), provision()]);
            authIdentityId = left.id;
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
            const unchanged = await prisma.authIdentity.findUniqueOrThrow({
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
            });
            const linked = await prisma.authIdentity.findUniqueOrThrow({
                where: { id: left.id },
                include: canonicalIdentityInclude
            });
            assert.equal(
                canonicalIdentity(linked).principal.user?.studentId,
                student.id
            );
        } finally {
            if (authIdentityId) {
                const identity = await prisma.authIdentity.findUniqueOrThrow({
                    where: { id: authIdentityId }
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
        const { createAuthIdentityService } =
            await import("#/modules/identity/auth-identity/AuthIdentity.service.js");
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
            assert.equal(actor.authIdentityId, admin.id);
            assert.equal(actor.studentId, null);
            assert.ok(actor.userId);
            const service = createAuthIdentityService({ prisma });
            const bot = await service.create({
                issuer,
                subject: "bot",
                displayName: "Fixture service",
                capabilities: ["ACADEMIC_WRITE"]
            });
            const read = (id: number) =>
                prisma.authIdentity.findUniqueOrThrow({
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
            await service.create({
                issuer,
                subject: "bot",
                displayName: "Reactivated service",
                capabilities: []
            });
            assert.equal((await read(bot.id)).status, "ACTIVE");
            await service.create({
                issuer,
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
                return createCanonicalIdentity(tx, {
                    issuer,
                    subject: "student",
                    email: `s${ra}@dac.unicamp.br`,
                    roles: [{ role: "STUDENT" }]
                });
            });
            id = account.id;
            const payload = {
                iss: issuer,
                sub: "student",
                email: `s${ra}@dac.unicamp.br`
            };
            const actor = await resolvePrincipal(payload, { prisma } as never);
            const service = createStudentService({ prisma });
            const result = await service.create(actor.userId!, {
                ra,
                name: "Registration fixture"
            });
            assert.ok(result.isOk());
            const studentId = result.value.student.id;
            const linked = await prisma.authIdentity.findUniqueOrThrow({
                where: { id },
                include: canonicalIdentityInclude
            });
            assert.equal(linked.legacyStudentId, null);
            assert.equal(
                canonicalIdentity(linked).principal.user?.studentId,
                studentId
            );
            assert.ok((await service.remove(studentId, ra)).isOk());
            const removed = await prisma.authIdentity.findUniqueOrThrow({
                where: { id },
                include: canonicalIdentityInclude
            });
            assert.equal(removed.legacyStudentId, null);
            assert.equal(
                canonicalIdentity(removed).principal.user?.studentId,
                null
            );
            const existing = await prisma.student.create({
                data: { ra, name: "Existing fixture" }
            });
            const relink = await service.create(actor.userId!, {
                ra,
                name: "Ignored for existing student"
            });
            assert.ok(relink.isOk());
            assert.equal(relink.value.student.id, existing.id);
            assert.equal(relink.value.linked, true);
            assert.ok((await service.remove(existing.id, ra)).isOk());
        } finally {
            if (id) {
                const identity = await prisma.authIdentity.findUniqueOrThrow({
                    where: { id }
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
            }
            await prisma.student.deleteMany({ where: { ra } });
            await prisma.$disconnect();
        }
    }
);

test(
    "concurrent unknown human logins create one canonical user without claiming academic records",
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
            azp: "pomi-frontend",
            email: `s${ra}@dac.unicamp.br`,
            name: "Login fixture"
        };
        try {
            const results = await Promise.all([
                resolvePrincipal(payload, { prisma } as never),
                resolvePrincipal(payload, { prisma } as never)
            ]);
            assert.equal(results[0].userId, results[1].userId);
            assert.equal(results[0].authIdentityId, results[1].authIdentityId);
            assert.equal(results[0].studentId, null);
            assert.equal(results[0].roles.size, 0);
            assert.equal(results[0].capabilities.size, 0);
            assert.equal(
                await prisma.authIdentity.count({ where: { issuer } }),
                1
            );
            assert.equal(await prisma.student.count({ where: { ra } }), 0);
            assert.equal(
                await prisma.user.count({
                    where: { principal: { identities: { some: { issuer } } } }
                }),
                1
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
            await prisma.student.deleteMany({ where: { ra } });
            await prisma.$disconnect();
        }
    }
);

test(
    "automatic admission does not recover an existing academic user by matching email or RA",
    { skip: !databaseUrl },
    async () => {
        process.env.DISABLED_AUTH = "true";
        const { resolvePrincipal } = await import("#/auth.js");
        const prisma = createDatabaseClient(
            localIdentityDatabaseUrl(databaseUrl)
        );
        const issuer = `https://admission.invalid/${randomUUID()}`;
        const email = "s990003@dac.unicamp.br";
        let originalPrincipalId: number | undefined;
        let studentId: number | undefined;
        try {
            const student = await prisma.student.create({
                data: { ra: "990003", name: "Academic fixture" }
            });
            studentId = student.id;
            const original = await prisma.principal.create({
                data: {
                    kind: "HUMAN",
                    user: {
                        create: {
                            name: "Existing person",
                            studentId,
                            emails: { create: { email } }
                        }
                    }
                },
                include: { user: true }
            });
            originalPrincipalId = original.id;
            const payload = {
                iss: issuer,
                sub: "new-credential",
                azp: "pomi-frontend",
                email,
                email_verified: true
            };
            const admitted = await resolvePrincipal(payload, {
                prisma
            } as never);
            assert.notEqual(admitted.userId, original.user!.id);
            assert.notEqual(admitted.principalId, original.id);
            assert.equal(admitted.studentId, null);
            assert.equal(
                await prisma.authIdentity.count({
                    where: { principalId: original.id }
                }),
                0
            );
            assert.equal(
                (
                    await prisma.user.findUniqueOrThrow({
                        where: { id: original.user!.id }
                    })
                ).studentId,
                student.id
            );
            const contact = await prisma.userEmail.findUniqueOrThrow({
                where: { userId_email: { userId: admitted.userId!, email } }
            });
            assert.equal(contact.verifiedAt, null);
            await prisma.principal.update({
                where: { id: admitted.principalId },
                data: { status: "DISABLED" }
            });
            await assert.rejects(
                resolvePrincipal(payload, { prisma } as never),
                /Forbidden/
            );
            assert.equal(
                await prisma.authIdentity.count({ where: { issuer } }),
                1
            );
        } finally {
            const identities = await prisma.authIdentity.findMany({
                where: { issuer }
            });
            const ids = identities.map(({ principalId }) => principalId);
            if (originalPrincipalId) ids.push(originalPrincipalId);
            await prisma.authIdentity.deleteMany({ where: { issuer } });
            await prisma.user.deleteMany({
                where: { principalId: { in: ids } }
            });
            await prisma.principal.deleteMany({ where: { id: { in: ids } } });
            if (studentId)
                await prisma.student.delete({ where: { id: studentId } });
            await prisma.$disconnect();
        }
    }
);
