import { config } from "dotenv";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { createDatabaseClient } from "../src/PrismaClient.js";
import {
    backfillUserOwnership,
    inspectUserOwnershipState
} from "../src/userOwnershipBackfill.js";

config({ path: resolve(import.meta.dirname, "../../../.env"), quiet: true });
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");
const migrations =
    process.env.POMI_IDENTITY_STAGED_MIGRATIONS_PATH ??
    resolve(import.meta.dirname, "../prisma/migrations");
const prismaConfig = resolve(import.meta.dirname, "../prisma.config.ts");
const contract = "20261102113617_contract_user_ownership";
const require = createRequire(import.meta.url);
const prismaCommand = resolve(
    dirname(require.resolve("prisma/package.json")),
    "build/index.js"
);
const prisma = createDatabaseClient(connectionString);

function deploy(path: string) {
    const result = spawnSync(
        process.execPath,
        [prismaCommand, "migrate", "deploy", "--config", prismaConfig],
        {
            env: { ...process.env, POMI_PRISMA_MIGRATIONS_PATH: path },
            stdio: "inherit"
        }
    );
    if (result.error) throw result.error;
    if (result.status !== 0)
        throw new Error(
            `Prisma migrate deploy failed with status ${result.status}.`
        );
}

let staged: string | undefined;
let expected: Awaited<ReturnType<typeof backfillUserOwnership>> | undefined;
try {
    const [state] = await prisma.$queryRaw<
        Array<{ expanded: boolean; legacy: boolean }>
    >`
        SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'app'
            AND table_name = 'User' AND column_name = 'publicId') AS expanded,
            EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'app'
            AND table_name = 'Student' AND column_name = 'publicId') AS legacy
    `;
    if (state!.legacy || !state!.expanded) {
        const directory = await readdir(migrations);
        if (!directory.includes(contract))
            throw new Error("Expected contraction migration is missing.");
        staged = await mkdtemp(resolve(tmpdir(), "pomi-user-migrations-"));
        for (const entry of directory) {
            if (entry === "migration_lock.toml" || entry < contract)
                await cp(resolve(migrations, entry), resolve(staged, entry), {
                    recursive: true
                });
        }
        deploy(staged);
        const existing = await prisma.student.count();
        if (
            existing > 0 &&
            process.env.POMI_USER_OWNERSHIP_WRITERS_STOPPED !== "1"
        )
            throw new Error(
                "Stop all legacy writers and set POMI_USER_OWNERSHIP_WRITERS_STOPPED=1 before backfill/contraction."
            );
        const preview = await backfillUserOwnership(prisma);
        expected = preview;
        console.log(
            JSON.stringify({ phase: "user-ownership-preview", ...preview })
        );
        const applied = await backfillUserOwnership(prisma, {
            apply: true,
            expectedSourceDigest: preview.sourceDigest
        });
        console.log(
            JSON.stringify({ phase: "user-ownership-backfill", ...applied })
        );
        const repeated = await backfillUserOwnership(prisma, { apply: true });
        if (repeated.createdUsers || repeated.copiedProfiles)
            throw new Error("Backfill did not reach an idempotent state.");
    }
    deploy(migrations);
    const preserved = await inspectUserOwnershipState(prisma);
    if (
        expected &&
        (preserved.preservedDataDigest !== expected.preservedDataDigest ||
            preserved.academicProfileDigest !== expected.academicProfileDigest)
    )
        throw new Error("Post-contraction data preservation audit failed.");
    const invalid = await prisma.$queryRaw<Array<{ source: string }>>`
        SELECT tc.table_name AS source FROM information_schema.table_constraints tc
        JOIN information_schema.referential_constraints rc
          ON rc.constraint_schema = tc.constraint_schema AND rc.constraint_name = tc.constraint_name
        JOIN information_schema.table_constraints target
          ON target.constraint_schema = rc.unique_constraint_schema AND target.constraint_name = rc.unique_constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' AND target.table_schema = 'app'
          AND target.table_name = 'Student' AND tc.table_name <> 'User'
    `;
    if (invalid.length)
        throw new Error("Unexpected foreign keys still reference Student.");
    console.log(
        JSON.stringify({
            phase: "user-ownership-complete",
            unexpectedStudentReferences: 0,
            ...preserved
        })
    );
} finally {
    await prisma.$disconnect();
    if (staged) await rm(staged, { recursive: true, force: true });
}
