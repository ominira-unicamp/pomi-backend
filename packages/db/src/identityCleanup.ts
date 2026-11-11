import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "../prisma/generated/client.js";
type Database = Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">;
export const userCapabilityNames = [
    "PROFILE_READ",
    "PROFILE_WRITE",
    "HISTORY_READ",
    "HISTORY_WRITE",
    "PLANNING_READ",
    "PLANNING_WRITE",
    "SOCIAL_READ",
    "SOCIAL_WRITE",
    "FEEDBACK_READ",
    "FEEDBACK_WRITE"
] as const;
export async function inspectIdentityCleanup(db: Database) {
    const tables = await db.$queryRaw<Array<{ tablename: string }>>`
        SELECT tablename FROM pg_tables WHERE schemaname='app' AND tablename <> '_prisma_migrations' ORDER BY tablename
    `;
    const hash = createHash("sha256");
    const counts: Record<string, number> = {};
    for (const { tablename } of tables) {
        const identifier = Prisma.raw(
            'app."' + tablename.replaceAll('"', '""') + '"'
        );
        const row =
            tablename === "BotGrant"
                ? Prisma.sql`(to_jsonb(t) || jsonb_build_object('capability', regexp_replace(t.capability::text, '^STUDENT_', 'USER_')))`
                : tablename === "AuthIdentity"
                  ? Prisma.sql`(to_jsonb(t) - ARRAY['legacyId','legacyStudentId']::text[])`
                  : tablename === "User"
                    ? Prisma.sql`(to_jsonb(t) - 'legacyStudentId')`
                    : Prisma.sql`to_jsonb(t)`;
        const rows = await db.$queryRaw<Array<{ value: string }>>(Prisma.sql`
            SELECT ${row}::text AS value FROM ${identifier} t ORDER BY value
        `);
        hash.update(tablename);
        counts[tablename] = rows.length;
        for (const { value } of rows) hash.update(value);
    }
    return { digest: hash.digest("hex"), counts };
}

export async function migrateUserCapabilities(prisma: PrismaClient) {
    return prisma.$transaction(
        async (tx) => {
            await tx.$executeRaw`LOCK TABLE app."BotGrant" IN ACCESS EXCLUSIVE MODE`;
            const before = await inspectIdentityCleanup(tx);
            const values = await tx.$queryRaw<Array<{ capability: string }>>`
            SELECT DISTINCT capability::text AS capability FROM app."BotGrant"
        `;
            const allowed = new Set(
                userCapabilityNames.flatMap((name) => [
                    `STUDENT_${name}`,
                    `USER_${name}`
                ])
            );
            if (values.some(({ capability }) => !allowed.has(capability)))
                throw new Error(
                    "Unknown BotGrant capability; cleanup was not applied."
                );
            const [type] = await tx.$queryRaw<Array<{ name: string }>>`
            SELECT t.typname AS name FROM pg_attribute a JOIN pg_type t ON t.oid=a.atttypid
            WHERE a.attrelid='app."BotGrant"'::regclass AND a.attname='capability'
        `;
            if (
                !type ||
                !["StudentCapability", "UserCapability"].includes(type.name)
            )
                throw new Error("Unexpected BotGrant capability enum.");
            const changed = await tx.$executeRaw(Prisma.sql`
            UPDATE app."BotGrant" SET capability=regexp_replace(capability::text, '^STUDENT_', 'USER_')::${Prisma.raw(`app."${type.name}"`)}
            WHERE capability::text LIKE 'STUDENT\\_%' ESCAPE '\\'
        `);
            const after = await inspectIdentityCleanup(tx);
            if (before.digest !== after.digest)
                throw new Error("User capability preservation audit failed.");
            return { ...after, changed };
        },
        { isolationLevel: "Serializable", timeout: 120000 }
    );
}
