import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "../prisma/generated/client.js";

type Transaction = Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">;
type Options = { apply?: boolean; expectedSourceDigest?: string };

async function credentialSnapshot(tx: Transaction, legacy: boolean) {
    const source = legacy
        ? 'app."AuthUser" a JOIN app."AuthIdentity" i ON i."legacyAuthUserId" = a.id'
        : 'app."AuthIdentity" i';
    const field = (old: string, current = old) =>
        legacy ? `a."${old}"` : `i."${current}"`;
    const roleTable = legacy ? "AuthUserRole" : "AuthIdentityRole";
    const capabilityTable = legacy
        ? "AuthUserCapability"
        : "AuthIdentityCapability";
    const key = legacy ? "authUserId" : "authIdentityId";
    const parent = legacy ? "a.id" : "i.id";
    return tx.$queryRaw<Array<{ value: string }>>(Prisma.sql`
        SELECT jsonb_build_object(
            'id', ${Prisma.raw(field("id", "legacyId"))},
            'identityId', i.id, 'principalId', i."principalId",
            'issuer', ${Prisma.raw(field("issuer"))},
            'subject', ${Prisma.raw(field("subject"))},
            'email', ${Prisma.raw(field("email"))},
            'displayName', ${Prisma.raw(field("displayName"))},
            'status', ${Prisma.raw(field("status"))}::text,
            'studentId', ${Prisma.raw(field("studentId", "legacyStudentId"))},
            'registeredAt', ${Prisma.raw(field("createdAt", "registeredAt"))},
            'credentialUpdatedAt', ${Prisma.raw(field("updatedAt", "credentialUpdatedAt"))},
            'roles', COALESCE((SELECT jsonb_agg(r.role::text ORDER BY r.role::text)
                FROM ${Prisma.raw(`app."${roleTable}"`)} r WHERE ${Prisma.raw(`r."${key}" = ${parent}`)}), '[]'::jsonb),
            'capabilities', COALESCE((SELECT jsonb_agg(c.capability::text ORDER BY c.capability::text)
                FROM ${Prisma.raw(`app."${capabilityTable}"`)} c WHERE ${Prisma.raw(`c."${key}" = ${parent}`)}), '[]'::jsonb)
        )::text AS value FROM ${Prisma.raw(source)} ORDER BY ${Prisma.raw(field("id", "legacyId"))}
    `);
}

export async function inspectAuthUserMigration(
    tx: Transaction,
    legacy = false
) {
    const credentials = await credentialSnapshot(tx, legacy);
    const grants = await tx.$queryRaw<Array<{ value: string }>>(Prisma.sql`
        SELECT ((to_jsonb(g) - ARRAY['botAuthUserId', 'grantedByAuthUserId', 'revokedByAuthUserId',
            'botAuthIdentityId', 'grantedByAuthIdentityId', 'revokedByAuthIdentityId']::text[])
            || jsonb_build_object('bot', ${Prisma.raw(legacy ? 'g."botAuthUserId"' : 'b."legacyId"')},
                'grantedBy', ${Prisma.raw(legacy ? 'g."grantedByAuthUserId"' : 'a."legacyId"')},
                'revokedBy', ${Prisma.raw(legacy ? 'g."revokedByAuthUserId"' : 'r."legacyId"')}))::text AS value
        FROM app."BotGrant" g
        ${Prisma.raw(legacy ? "" : 'LEFT JOIN app."AuthIdentity" b ON b.id = g."botAuthIdentityId" LEFT JOIN app."AuthIdentity" a ON a.id = g."grantedByAuthIdentityId" LEFT JOIN app."AuthIdentity" r ON r.id = g."revokedByAuthIdentityId"')}
        ORDER BY g.id
    `);
    const immutable = await tx.$queryRaw<Array<{ value: string }>>`
        SELECT row_to_json(i)::text AS value FROM (
            SELECT id, "principalId", issuer, subject, "createdAt", "updatedAt" FROM app."AuthIdentity" ORDER BY id
        ) i
    `;
    const hash = createHash("sha256");
    for (const [name, rows] of [
        ["credentials", credentials],
        ["grants", grants],
        ["identityLinks", immutable]
    ] as const) {
        hash.update(name);
        for (const row of rows) hash.update(row.value);
    }
    return {
        semanticDigest: hash.digest("hex"),
        credentials: credentials.length,
        grants: grants.length
    };
}

export async function migrateAuthUsers(
    prisma: PrismaClient,
    options: Options = {}
) {
    return prisma.$transaction(
        async (tx) => {
            if (!options.apply) await tx.$executeRaw`SET TRANSACTION READ ONLY`;
            const [invalid] = await tx.$queryRaw<Array<{ count: bigint }>>`
            SELECT count(*) AS count FROM app."AuthUser" a
            LEFT JOIN app."AuthIdentity" i ON i."legacyAuthUserId" = a.id
            LEFT JOIN app."Principal" p ON p.id = i."principalId"
            LEFT JOIN app."User" u ON u."principalId" = p.id
            LEFT JOIN app."ServiceAccount" s ON s."principalId" = p.id
            WHERE i.id IS NULL OR i.issuer IS DISTINCT FROM a.issuer OR i.subject IS DISTINCT FROM a.subject
               OR p.id IS NULL OR (p.kind = 'HUMAN' AND (u.id IS NULL OR s.id IS NOT NULL))
               OR (p.kind = 'SERVICE' AND (s.id IS NULL OR u.id IS NOT NULL))
               OR (a."studentId" IS NOT NULL AND a."studentId" IS DISTINCT FROM u."studentId")
        `;
            if (invalid!.count !== 0n)
                throw new Error(
                    "AuthUser migration requires consistent canonical identities."
                );
            const source = await inspectAuthUserMigration(tx, true);
            const [sequence] = await tx.$queryRaw<
                Array<{ name: string }>
            >`SELECT pg_get_serial_sequence('app."AuthUser"', 'id') AS name`;
            if (!sequence?.name)
                throw new Error("Legacy credential sequence is missing.");
            const [position] = await tx.$queryRaw<
                Array<{ last_value: bigint; is_called: boolean }>
            >(
                Prisma.sql`SELECT last_value, is_called FROM ${Prisma.raw(sequence.name)}`
            );
            const legacyIdHighWater = position!.is_called
                ? Number(position!.last_value)
                : 0;
            const sourceDigest = createHash("sha256")
                .update(JSON.stringify({ ...source, legacyIdHighWater }))
                .digest("hex");
            const identities = await tx.$queryRaw<
                Array<{ count: bigint }>
            >`SELECT count(*) AS count FROM app."AuthIdentity"`;
            if (BigInt(source.credentials) !== identities[0]!.count)
                throw new Error(
                    "Canonical identity without a legacy source requires reconciliation."
                );
            if (
                options.expectedSourceDigest &&
                options.expectedSourceDigest !== sourceDigest
            )
                throw new Error("AuthUser source changed after preview.");
            if (options.apply) {
                await tx.$executeRaw`
                UPDATE app."AuthIdentity" i SET "legacyId" = a.id, "legacyStudentId" = a."studentId",
                    email = a.email, "displayName" = a."displayName", status = a.status::text::app."AuthIdentityStatus",
                    "registeredAt" = a."createdAt", "credentialUpdatedAt" = a."updatedAt"
                FROM app."AuthUser" a WHERE i."legacyAuthUserId" = a.id
            `;
                await tx.$executeRaw`
                INSERT INTO app."AuthIdentityRole" ("authIdentityId", role)
                SELECT i.id, r.role FROM app."AuthUserRole" r JOIN app."AuthIdentity" i ON i."legacyAuthUserId" = r."authUserId"
                ON CONFLICT DO NOTHING
            `;
                await tx.$executeRaw`
                INSERT INTO app."AuthIdentityCapability" ("authIdentityId", capability)
                SELECT i.id, c.capability FROM app."AuthUserCapability" c JOIN app."AuthIdentity" i ON i."legacyAuthUserId" = c."authUserId"
                ON CONFLICT DO NOTHING
            `;
                await tx.$executeRaw`
                UPDATE app."BotGrant" g SET "botAuthIdentityId" = b.id, "grantedByAuthIdentityId" = a.id,
                    "revokedByAuthIdentityId" = NULL
                FROM app."AuthIdentity" b, app."AuthIdentity" a
                WHERE b."legacyAuthUserId" = g."botAuthUserId" AND a."legacyAuthUserId" = g."grantedByAuthUserId"
                  AND g."revokedByAuthUserId" IS NULL
            `;
                await tx.$executeRaw`
                UPDATE app."BotGrant" g SET "botAuthIdentityId" = b.id, "grantedByAuthIdentityId" = a.id,
                    "revokedByAuthIdentityId" = r.id
                FROM app."AuthIdentity" b, app."AuthIdentity" a, app."AuthIdentity" r
                WHERE b."legacyAuthUserId" = g."botAuthUserId" AND a."legacyAuthUserId" = g."grantedByAuthUserId"
                  AND r."legacyAuthUserId" = g."revokedByAuthUserId"
            `;
                const result = await inspectAuthUserMigration(tx);
                if (result.semanticDigest !== source.semanticDigest)
                    throw new Error(
                        "AuthUser backfill preservation audit failed."
                    );
            }
            return {
                ...source,
                sourceDigest,
                legacyIdHighWater,
                apply: !!options.apply
            };
        },
        { isolationLevel: "Serializable", timeout: 30000 }
    );
}

export async function inspectOtherApplicationData(tx: Transaction) {
    const tables = await tx.$queryRaw<Array<{ tablename: string }>>`
        SELECT tablename FROM pg_tables WHERE schemaname='app' AND tablename NOT IN
            ('AuthUser', 'AuthUserRole', 'AuthUserCapability', 'AuthIdentity', 'AuthIdentityRole', 'AuthIdentityCapability', 'BotGrant')
        ORDER BY tablename
    `;
    const hash = createHash("sha256");
    const counts: Record<string, number> = {};
    for (const { tablename } of tables) {
        const identifier = Prisma.raw(
            'app."' + tablename.replaceAll('"', '""') + '"'
        );
        const rows = await tx.$queryRaw<Array<{ value: string }>>(
            Prisma.sql`SELECT to_jsonb(t)::text AS value FROM ${identifier} t ORDER BY value`
        );
        hash.update(tablename);
        counts[tablename] = rows.length;
        for (const row of rows) hash.update(row.value);
    }
    return { applicationDataDigest: hash.digest("hex"), counts };
}
