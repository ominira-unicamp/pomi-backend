import { config } from "dotenv";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { Prisma } from "../prisma/generated/client.js";
import {
    inspectAuthUserMigration,
    inspectOtherApplicationData,
    migrateAuthUsers
} from "../src/authUserMigration.js";
import {
    canonicalIdentity,
    canonicalIdentityInclude
} from "../src/identity.js";
import { createDatabaseClient } from "../src/PrismaClient.js";

config({ path: resolve(import.meta.dirname, "../../../.env"), quiet: true });
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");
const prisma = createDatabaseClient(connectionString);
const require = createRequire(import.meta.url);
const prismaCommand = resolve(
    dirname(require.resolve("prisma/package.json")),
    "build/index.js"
);
const migrations = resolve(import.meta.dirname, "../prisma/migrations");
const contract = "20261102210600_remove_legacy_auth_users";
let staged: string | undefined;

function run(args: string[], env = process.env) {
    const result = spawnSync(process.execPath, args, { env, stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0)
        throw new Error(
            `Identity migration subprocess failed with status ${result.status}.`
        );
}
function deploy() {
    run([
        prismaCommand,
        "migrate",
        "deploy",
        "--config",
        resolve(import.meta.dirname, "../prisma.config.ts")
    ]);
}

try {
    const [state] = await prisma.$queryRaw<
        Array<{ legacy: boolean; canonical: boolean }>
    >`
        SELECT to_regclass('app."AuthUser"') IS NOT NULL AS legacy,
            to_regclass('app."AuthIdentity"') IS NOT NULL AS canonical
    `;
    let expected: Awaited<ReturnType<typeof migrateAuthUsers>> | undefined;
    let preserved:
        | Awaited<ReturnType<typeof inspectOtherApplicationData>>
        | undefined;
    if (state!.legacy || !state!.canonical) {
        if (state!.legacy) {
            const [rows] = await prisma.$queryRaw<
                Array<{ count: bigint }>
            >`SELECT count(*) AS count FROM app."AuthUser"`;
            if (
                rows!.count > 0n &&
                process.env.POMI_AUTHUSER_WRITERS_STOPPED !== "1"
            )
                throw new Error(
                    "Stop all legacy writers and set POMI_AUTHUSER_WRITERS_STOPPED=1 before credential migration."
                );
        }
        const entries = await readdir(migrations);
        if (!entries.includes(contract))
            throw new Error(
                "Expected AuthUser contraction migration is missing."
            );
        staged = await mkdtemp(
            resolve(tmpdir(), "pomi-credential-migrations-")
        );
        for (const entry of entries)
            if (entry === "migration_lock.toml" || entry < contract)
                await cp(resolve(migrations, entry), resolve(staged, entry), {
                    recursive: true
                });
        run(
            [
                "--import",
                "tsx",
                resolve(import.meta.dirname, "deploy-user-ownership.ts")
            ],
            {
                ...process.env,
                POMI_IDENTITY_STAGED_MIGRATIONS_PATH: staged,
                POMI_USER_OWNERSHIP_WRITERS_STOPPED:
                    process.env.POMI_AUTHUSER_WRITERS_STOPPED
            }
        );
        preserved = await inspectOtherApplicationData(prisma);
        expected = await migrateAuthUsers(prisma);
        console.log(
            JSON.stringify({
                phase: "authuser-preview",
                ...expected,
                ...preserved
            })
        );
        const applied = await migrateAuthUsers(prisma, {
            apply: true,
            expectedSourceDigest: expected.sourceDigest
        });
        console.log(JSON.stringify({ phase: "authuser-backfill", ...applied }));
        const repeated = await migrateAuthUsers(prisma, {
            apply: true,
            expectedSourceDigest: expected.sourceDigest
        });
        if (repeated.semanticDigest !== expected.semanticDigest)
            throw new Error("Credential backfill was not idempotent.");
    }
    deploy();
    if (expected) {
        const [sequence] = await prisma.$queryRaw<
            Array<{ name: string }>
        >`SELECT pg_get_serial_sequence('app."AuthIdentity"', 'legacyId') AS name`;
        if (!sequence?.name)
            throw new Error("Credential alias sequence is missing.");
        await prisma.$executeRaw(Prisma.sql`
            SELECT setval(${sequence.name}::regclass,
                GREATEST(COALESCE((SELECT MAX("legacyId") FROM app."AuthIdentity"),0), ${expected.legacyIdHighWater}) + 1, false)
        `);
    }
    const current = await inspectAuthUserMigration(prisma);
    const application = await inspectOtherApplicationData(prisma);
    if (
        (expected && expected.semanticDigest !== current.semanticDigest) ||
        (preserved &&
            preserved.applicationDataDigest !==
                application.applicationDataDigest)
    )
        throw new Error(
            "Post-contraction credential/application preservation audit failed."
        );
    const legacy = await prisma.$queryRaw<Array<{ tablename: string }>>`
        SELECT tablename FROM pg_tables WHERE schemaname='app' AND tablename IN ('AuthUser','AuthUserRole','AuthUserCapability')
    `;
    if (legacy.length) throw new Error("Legacy credential tables still exist.");
    for (const identity of await prisma.authIdentity.findMany({
        include: canonicalIdentityInclude
    }))
        canonicalIdentity(identity);
    const [position] = await prisma.$queryRaw<
        Array<{ next: bigint; maximum: number }>
    >`
        SELECT CASE WHEN is_called THEN last_value+1 ELSE last_value END AS next,
            (SELECT COALESCE(MAX("legacyId"),0) FROM app."AuthIdentity") AS maximum
        FROM app.authidentity_legacyid_seq
    `;
    if (position!.next <= BigInt(position!.maximum))
        throw new Error(
            "Credential alias sequence would reuse existing identifiers."
        );
    console.log(
        JSON.stringify({
            phase: "authuser-complete",
            ...current,
            ...application,
            legacyTables: 0,
            canonicalIdentitiesValid: true,
            aliasSequenceValid: true
        })
    );
} finally {
    await prisma.$disconnect();
    if (staged) await rm(staged, { recursive: true, force: true });
}
