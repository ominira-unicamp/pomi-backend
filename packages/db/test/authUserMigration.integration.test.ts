import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import test from "node:test";
import {
    inspectAuthUserMigration,
    migrateAuthUsers
} from "../src/authUserMigration.js";
import { createDatabaseClient } from "../src/PrismaClient.js";

const databaseUrl = process.env.POMI_AUTHUSER_EXPANSION_TEST_DATABASE_URL;

test(
    "migrates credentials without joining privileges, preserves grant authors and rolls back invalid sources",
    { skip: !databaseUrl },
    async () => {
        const url = new URL(databaseUrl!);
        assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
        assert.ok(url.pathname.endsWith("_test"));
        assert.notEqual(url.port, "5433");
        const prisma = createDatabaseClient(databaseUrl!);
        const issuer = `https://migration.test/${randomUUID()}`;
        const base = randomInt(100000000, 200000000);
        const principalIds: number[] = [];
        try {
            for (const kind of ["HUMAN", "SERVICE"] as const) {
                const p = await prisma.principal.create({
                    data: {
                        kind,
                        ...(kind === "HUMAN"
                            ? { user: { create: { name: "Canonical person" } } }
                            : {
                                  serviceAccount: {
                                      create: { name: "Canonical service" }
                                  }
                              })
                    }
                });
                principalIds.push(p.id);
            }
            for (const [index, role, status] of [
                [0, "STUDENT", "DISABLED"],
                [1, "ADMIN", "ACTIVE"],
                [2, "BOT", "ACTIVE"]
            ] as const) {
                const oldId = base + index;
                const identityId = base + 100 + index;
                await prisma.$executeRaw`
                INSERT INTO app."AuthUser" (id, issuer, subject, email, "displayName", status, "updatedAt")
                VALUES (${oldId}, ${issuer}, ${String(index)}, ${`contact${index}@example.test`}, ${`Credential ${index}`}, ${status}::app."AuthUserStatus", now())
            `;
                await prisma.$executeRaw`
                INSERT INTO app."AuthIdentity" (id, issuer, subject, "principalId", "legacyAuthUserId", "updatedAt")
                VALUES (${identityId}, ${issuer}, ${String(index)}, ${principalIds[index === 2 ? 1 : 0]}, ${oldId}, now())
            `;
                await prisma.$executeRaw`INSERT INTO app."AuthUserRole" ("authUserId", role) VALUES (${oldId}, ${role}::app."AuthRole")`;
            }
            await prisma.$executeRaw`INSERT INTO app."AuthUserCapability" ("authUserId", capability) VALUES (${base + 1}, 'ACADEMIC_WRITE')`;
            const user = await prisma.user.findUniqueOrThrow({
                where: { principalId: principalIds[0] }
            });
            await prisma.$executeRaw`
            INSERT INTO app."BotGrant" ("userId", "botAuthUserId", capability, "grantedByAuthUserId", "revokedByAuthUserId", "revokedAt")
            VALUES (${user.id}, ${base + 2}, 'STUDENT_PROFILE_READ', ${base + 1}, ${base}, now())
        `;
            const preview = await migrateAuthUsers(prisma);
            const [untouched] = await prisma.$queryRaw<
                Array<{ count: bigint }>
            >`
            SELECT count(*) AS count FROM app."AuthIdentity" WHERE issuer=${issuer} AND "legacyId" IS NULL
        `;
            assert.equal(untouched!.count, 3n);
            await assert.rejects(
                migrateAuthUsers(prisma, {
                    apply: true,
                    expectedSourceDigest: "changed"
                }),
                /source changed/
            );
            await prisma.$executeRaw`INSERT INTO app."AuthIdentityRole" ("authIdentityId", role) VALUES (${base + 100}, 'ADMIN')`;
            await assert.rejects(
                migrateAuthUsers(prisma, {
                    apply: true,
                    expectedSourceDigest: preview.sourceDigest
                }),
                /preservation audit/
            );
            const [rolledBack] = await prisma.$queryRaw<
                Array<{ count: bigint }>
            >`
            SELECT count(*) AS count FROM app."AuthIdentity" WHERE issuer=${issuer} AND "legacyId" IS NULL
        `;
            assert.equal(rolledBack!.count, 3n);
            await prisma.$executeRaw`DELETE FROM app."AuthIdentityRole" WHERE "authIdentityId"=${base + 100} AND role='ADMIN'`;
            const applied = await migrateAuthUsers(prisma, {
                apply: true,
                expectedSourceDigest: preview.sourceDigest
            });
            assert.equal(applied.semanticDigest, preview.semanticDigest);
            assert.equal(
                (await migrateAuthUsers(prisma, { apply: true }))
                    .semanticDigest,
                preview.semanticDigest
            );
            assert.equal(
                (await inspectAuthUserMigration(prisma)).semanticDigest,
                preview.semanticDigest
            );
            const identities = await prisma.authIdentity.findMany({
                where: { issuer },
                orderBy: { legacyId: "asc" },
                include: { roles: true, capabilities: true }
            });
            assert.deepEqual(
                identities.map((x) => x.legacyId),
                [base, base + 1, base + 2]
            );
            assert.deepEqual(
                identities.map((x) => x.status),
                ["DISABLED", "ACTIVE", "ACTIVE"]
            );
            assert.deepEqual(
                identities.map((x) => x.roles.map((r) => r.role)),
                [["STUDENT"], ["ADMIN"], ["BOT"]]
            );
            assert.deepEqual(
                identities.map((x) => x.capabilities.map((c) => c.capability)),
                [[], ["ACADEMIC_WRITE"], []]
            );
            const grant = await prisma.botGrant.findFirstOrThrow({
                where: { userId: user.id }
            });
            assert.equal(grant.botAuthIdentityId, base + 102);
            assert.equal(grant.grantedByAuthIdentityId, base + 101);
            assert.equal(grant.revokedByAuthIdentityId, base + 100);
        } finally {
            await prisma.$executeRaw`DELETE FROM app."BotGrant" WHERE "botAuthUserId" BETWEEN ${base} AND ${base + 2}`;
            await prisma.$executeRaw`DELETE FROM app."AuthIdentity" WHERE issuer=${issuer}`;
            await prisma.$executeRaw`DELETE FROM app."AuthUser" WHERE issuer=${issuer}`;
            await prisma.user.deleteMany({
                where: { principalId: { in: principalIds } }
            });
            await prisma.serviceAccount.deleteMany({
                where: { principalId: { in: principalIds } }
            });
            await prisma.principal.deleteMany({
                where: { id: { in: principalIds } }
            });
            await prisma.$disconnect();
        }
    }
);
