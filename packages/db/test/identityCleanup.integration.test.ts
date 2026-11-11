import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { Client } from "pg";
import { createDatabaseClient } from "../src/PrismaClient.js";
import { localIdentityDatabaseUrl } from "../src/identityBackfill.js";
import {
    inspectIdentityCleanup,
    migrateUserCapabilities,
    userCapabilityNames
} from "../src/identityCleanup.js";
const databaseUrl = process.env.POMI_IDENTITY_CLEANUP_TEST_DATABASE_URL;
const root = resolve(import.meta.dirname, "../../..");
const migrations = resolve(root, "packages/db/prisma/migrations");
const expansion = "20261111021511_expand_user_capabilities";
const contraction = "20261111021726_contract_identity_compatibility";
function command(args: string[], url: string, extra: NodeJS.ProcessEnv = {}) {
    const result = spawnSync(process.execPath, args, {
        cwd: root,
        env: { ...process.env, DATABASE_URL: url, ...extra },
        encoding: "utf8",
        timeout: 180000,
        maxBuffer: 8 * 1024 * 1024
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stdout + result.stderr);
}

async function deployStage(url: string, boundary: string) {
    const directory = await mkdtemp(resolve(tmpdir(), "pomi-cleanup-test-"));
    try {
        for (const entry of await readdir(migrations))
            if (entry === "migration_lock.toml" || entry <= boundary)
                await cp(
                    resolve(migrations, entry),
                    resolve(directory, entry),
                    { recursive: true }
                );
        command(
            [
                "node_modules/prisma/build/index.js",
                "migrate",
                "deploy",
                "--config",
                "packages/db/prisma.config.ts"
            ],
            url,
            { POMI_PRISMA_MIGRATIONS_PATH: directory }
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}

function deploy(url: string, stopped = true) {
    command(
        ["--import", "tsx", "packages/db/scripts/deploy-identities.ts"],
        url,
        { POMI_AUTHUSER_WRITERS_STOPPED: stopped ? "1" : "" }
    );
}

async function seed(client: Client, legacy = false) {
    const student = (
        await client.query(
            `INSERT INTO app."Student" (ra,name) VALUES ('123456','Academic fixture') RETURNING id`
        )
    ).rows[0].id;
    const person = (
        await client.query(
            `INSERT INTO app."Principal" (kind,"updatedAt") VALUES ('HUMAN',now()) RETURNING id`
        )
    ).rows[0].id;
    const bot = (
        await client.query(
            `INSERT INTO app."Principal" (kind,"updatedAt") VALUES ('SERVICE',now()) RETURNING id`
        )
    ).rows[0].id;
    const user = (
        await client.query(
            `INSERT INTO app."User" ("principalId","studentId",name,"updatedAt") VALUES ($1,$2,'Person fixture',now()) RETURNING id`,
            [person, student]
        )
    ).rows[0].id;
    await client.query(
        `INSERT INTO app."ServiceAccount" ("principalId",name,"updatedAt") VALUES ($1,'Bot fixture',now())`,
        [bot]
    );
    const identities: number[] = [];
    const accounts: number[] = [];
    for (const [index, role] of ["STUDENT", "ADMIN", "BOT"].entries()) {
        const principal = index === 2 ? bot : person;
        if (legacy) {
            const account = (
                await client.query(
                    `INSERT INTO app."AuthUser" (issuer,subject,email,"studentId",status,"updatedAt") VALUES ('https://cleanup.test',$1,$2,$3,$4,now()) RETURNING id`,
                    [
                        String(index),
                        `contact${index}@example.test`,
                        index === 2 ? null : student,
                        index === 0 ? "DISABLED" : "ACTIVE"
                    ]
                )
            ).rows[0].id;
            accounts.push(account);
            await client.query(
                `INSERT INTO app."AuthUserRole" ("authUserId",role) VALUES ($1,$2::app."AuthRole")`,
                [account, role]
            );
            identities.push(
                (
                    await client.query(
                        `INSERT INTO app."AuthIdentity" (issuer,subject,"principalId","legacyAuthUserId","updatedAt") VALUES ('https://cleanup.test',$1,$2,$3,now()) RETURNING id`,
                        [String(index), principal, account]
                    )
                ).rows[0].id
            );
        } else {
            identities.push(
                (
                    await client.query(
                        `INSERT INTO app."AuthIdentity" (issuer,subject,"principalId",email,status,"updatedAt") VALUES ('https://cleanup.test',$1,$2,$3,$4,now()) RETURNING id`,
                        [
                            String(index),
                            principal,
                            `contact${index}@example.test`,
                            index === 0 ? "DISABLED" : "ACTIVE"
                        ]
                    )
                ).rows[0].id
            );
            await client.query(
                `INSERT INTO app."AuthIdentityRole" ("authIdentityId",role) VALUES ($1,$2::app."AuthRole")`,
                [identities[index], role]
            );
        }
    }
    if (!legacy) {
        await client.query(
            `UPDATE app."User" SET "legacyStudentId"=$1 WHERE id=$2`,
            [student, user]
        );
        await client.query(
            `INSERT INTO app."UserEmail" ("userId",email,"updatedAt") VALUES ($1,'contact@example.test',now())`,
            [user]
        );
    }
    for (const name of userCapabilityNames)
        for (const revoked of [false, true])
            if (legacy)
                await client.query(
                    `INSERT INTO app."BotGrant" ("studentId","botAuthUserId","grantedByAuthUserId","revokedByAuthUserId",capability,"revokedAt") VALUES ($1,$2,$3,$4,$5::app."StudentCapability",$6)`,
                    [
                        student,
                        accounts[2],
                        accounts[1],
                        revoked ? accounts[0] : null,
                        `STUDENT_${name}`,
                        revoked ? new Date(1000) : null
                    ]
                );
            else
                await client.query(
                    `INSERT INTO app."BotGrant" ("userId","botAuthIdentityId","grantedByAuthIdentityId","revokedByAuthIdentityId",capability,"revokedAt") VALUES ($1,$2,$3,$4,$5::app."StudentCapability",$6)`,
                    [
                        user,
                        identities[2],
                        identities[1],
                        revoked ? identities[0] : null,
                        `STUDENT_${name}`,
                        revoked ? new Date(1000) : null
                    ]
                );
    const additionalPerson = (
        await client.query(
            `INSERT INTO app."Principal" (kind,"updatedAt") VALUES ('HUMAN',now()) RETURNING id`
        )
    ).rows[0].id;
    await client.query(
        `INSERT INTO app."User" ("principalId",name,"updatedAt") VALUES ($1,'Person without student',now())`,
        [additionalPerson]
    );
    const orphanStudent = legacy
        ? ((
              await client.query(
                  `INSERT INTO app."Student" (ra,name) VALUES ('654321','Academic profile without user') RETURNING id`
              )
          ).rows[0].id as number)
        : undefined;
    return { user, student, identities, orphanStudent };
}

test(
    "identity cleanup preserves fresh, canonical, historical and interrupted upgrades",
    { skip: !databaseUrl, timeout: 600000 },
    async (t) => {
        const base = new URL(localIdentityDatabaseUrl(databaseUrl));
        const admin = new Client({ connectionString: base.toString() });
        await admin.connect();
        try {
            for (const scenario of [
                "fresh",
                "canonical",
                "historical",
                "expanded",
                "converted",
                "contracted"
            ] as const)
                await t.test(scenario, async () => {
                    const name = `cleanup_${scenario}_${randomUUID().replaceAll("-", "")}_test`;
                    await admin.query(`CREATE DATABASE "${name}"`);
                    const url = new URL(base);
                    url.pathname = `/${name}`;
                    const client = new Client({
                        connectionString: url.toString()
                    });
                    const prisma = createDatabaseClient(url.toString());
                    try {
                        await client.connect();
                        let fixture:
                            | Awaited<ReturnType<typeof seed>>
                            | undefined;
                        let before:
                            | Awaited<ReturnType<typeof inspectIdentityCleanup>>
                            | undefined;
                        if (scenario !== "fresh") {
                            await deployStage(
                                url.toString(),
                                scenario === "historical"
                                    ? "20261102070418_introduce_identity_principals"
                                    : "20261102210600_remove_legacy_auth_users"
                            );
                            fixture = await seed(
                                client,
                                scenario === "historical"
                            );
                            if (scenario !== "historical")
                                before = await inspectIdentityCleanup(prisma);
                            if (
                                [
                                    "expanded",
                                    "converted",
                                    "contracted"
                                ].includes(scenario)
                            )
                                await deployStage(url.toString(), expansion);
                            if (
                                ["converted", "contracted"].includes(scenario)
                            ) {
                                assert.equal(
                                    (await migrateUserCapabilities(prisma))
                                        .changed,
                                    20
                                );
                                assert.equal(
                                    (await migrateUserCapabilities(prisma))
                                        .changed,
                                    0
                                );
                            }
                            if (scenario === "contracted")
                                await deployStage(url.toString(), contraction);
                        }
                        if (scenario === "canonical") {
                            assert.throws(
                                () => deploy(url.toString(), false),
                                /Stop all writers/
                            );
                            assert.equal(
                                (await inspectIdentityCleanup(prisma)).digest,
                                before!.digest
                            );
                        }
                        deploy(url.toString());
                        const after = await inspectIdentityCleanup(prisma);
                        if (before) assert.equal(after.digest, before.digest);
                        deploy(url.toString());
                        assert.equal(
                            (await inspectIdentityCleanup(prisma)).digest,
                            after.digest
                        );
                        assert.equal(
                            (
                                await client.query(
                                    `SELECT column_name FROM information_schema.columns WHERE table_schema='app' AND table_name IN ('AuthIdentity','User') AND column_name IN ('legacyId','legacyStudentId')`
                                )
                            ).rowCount,
                            0
                        );
                        assert.equal(
                            (
                                await client.query(
                                    `SELECT typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='app' AND t.typname='StudentCapability'`
                                )
                            ).rowCount,
                            0
                        );
                        if (fixture) {
                            assert.equal(
                                (
                                    await client.query(
                                        `SELECT count(*)::integer AS count FROM app."User" WHERE name='Person without student' AND "studentId" IS NULL`
                                    )
                                ).rows[0].count,
                                1
                            );
                            if (fixture.orphanStudent)
                                assert.equal(
                                    (
                                        await client.query(
                                            `SELECT count(*)::integer AS count FROM app."User" WHERE "studentId"=$1`,
                                            [fixture.orphanStudent]
                                        )
                                    ).rows[0].count,
                                    1
                                );
                            const grants = (
                                await client.query(
                                    `SELECT * FROM app."BotGrant" ORDER BY id`
                                )
                            ).rows;
                            assert.equal(grants.length, 20);
                            assert.equal(
                                grants.filter((g) => g.revokedAt !== null)
                                    .length,
                                10
                            );
                            for (const grant of grants) {
                                assert.equal(grant.userId, fixture.user);
                                assert.equal(
                                    grant.botAuthIdentityId,
                                    fixture.identities[2]
                                );
                                assert.equal(
                                    grant.grantedByAuthIdentityId,
                                    fixture.identities[1]
                                );
                                assert.equal(
                                    grant.revokedByAuthIdentityId,
                                    grant.revokedAt
                                        ? fixture.identities[0]
                                        : null
                                );
                                assert.ok(grant.capability.startsWith("USER_"));
                            }
                            const roles = (
                                await client.query(
                                    `SELECT "authIdentityId",role FROM app."AuthIdentityRole" ORDER BY "authIdentityId"`
                                )
                            ).rows;
                            assert.deepEqual(
                                roles.map((r) => r.role),
                                ["STUDENT", "ADMIN", "BOT"]
                            );
                            assert.equal(
                                (
                                    await client.query(
                                        `SELECT status FROM app."AuthIdentity" WHERE id=$1`,
                                        [fixture.identities[0]]
                                    )
                                ).rows[0].status,
                                "DISABLED"
                            );
                        }
                    } finally {
                        await client.end();
                        await prisma.$disconnect();
                        await admin.query(`DROP DATABASE "${name}"`);
                    }
                });
        } finally {
            await admin.end();
        }
    }
);
