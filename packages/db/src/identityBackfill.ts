import type { PrismaClient } from "../prisma/generated/client.js";
import {
    classifyIdentity,
    IdentityConsistencyError,
    type IdentityKind
} from "./identity.js";
import {
    readLegacyIdentityAccounts,
    validateLegacyIdentity,
    type LegacyIdentityAccount
} from "./legacyIdentityMigration.js";

export type IdentityMapping = {
    canonicalAuthUserId: number;
    authUserIds: number[];
    kind?: IdentityKind;
    expectedIdentities: Array<{
        id: number;
        issuer: string;
        subject: string;
        studentId: number | null;
    }>;
};

type Source = LegacyIdentityAccount;

export function planIdentityBackfill(
    accounts: Source[],
    mappings: IdentityMapping[]
) {
    const byId = new Map(accounts.map((account) => [account.id, account]));
    const claimed = new Set<number>();
    const groups: Array<{
        accounts: Source[];
        canonical: Source;
        kind: IdentityKind;
        studentId: number | null;
    }> = [];
    const add = (ids: number[], canonicalId: number, kind?: IdentityKind) => {
        if (
            !ids.length ||
            !ids.includes(canonicalId) ||
            new Set(ids).size !== ids.length
        )
            throw new IdentityConsistencyError("Invalid identity mapping.");
        const members = ids.map((id) => {
            const account = byId.get(id);
            if (!account || claimed.has(id))
                throw new IdentityConsistencyError(
                    "Unknown or repeated legacy identity."
                );
            claimed.add(id);
            return account;
        });
        const canonical = byId.get(canonicalId)!;
        const kinds = new Set(
            members.map((account) => kind ?? classifyIdentity(account.roles))
        );
        if (kinds.size !== 1)
            throw new IdentityConsistencyError("Incompatible identity kinds.");
        const resolvedKind = [...kinds][0];
        const students = new Set(
            members.flatMap((account) =>
                account.studentId === null ? [] : [account.studentId]
            )
        );
        if (students.size > 1 || (resolvedKind === "SERVICE" && students.size))
            throw new IdentityConsistencyError(
                "Conflicting student associations."
            );
        const studentId = [...students][0] ?? null;
        groups.push({
            accounts: members,
            canonical,
            kind: resolvedKind,
            studentId
        });
    };
    for (const mapping of mappings) {
        if (
            !Array.isArray(mapping.authUserIds) ||
            !Array.isArray(mapping.expectedIdentities) ||
            (mapping.kind !== undefined &&
                mapping.kind !== "HUMAN" &&
                mapping.kind !== "SERVICE") ||
            mapping.expectedIdentities.length !== mapping.authUserIds.length ||
            new Set(mapping.expectedIdentities.map(({ id }) => id)).size !==
                mapping.authUserIds.length
        )
            throw new IdentityConsistencyError("Invalid mapping manifest.");
        for (const id of mapping.authUserIds) {
            const expected = mapping.expectedIdentities.find(
                (entry) => entry.id === id
            );
            const account = byId.get(id);
            if (
                !expected ||
                !account ||
                expected.issuer !== account.issuer ||
                expected.subject !== account.subject ||
                expected.studentId !== account.studentId
            )
                throw new IdentityConsistencyError(
                    "Mapping does not match the inspected source."
                );
        }
        add(mapping.authUserIds, mapping.canonicalAuthUserId, mapping.kind);
    }
    for (const account of accounts)
        if (!claimed.has(account.id)) add([account.id], account.id);
    const students = new Set<number>();
    const principals = new Set<number>();
    for (const group of groups) {
        if (group.studentId !== null) {
            if (students.has(group.studentId))
                throw new IdentityConsistencyError(
                    "Shared student requires an explicit identity mapping."
                );
            students.add(group.studentId);
        }
        const existing = group.accounts.filter(
            (account) => account.authIdentity
        );
        if (existing.length && existing.length !== group.accounts.length)
            throw new IdentityConsistencyError(
                "Partial backfill requires explicit reconciliation."
            );
        if (existing.length) {
            const ids = new Set(
                existing.map(
                    (account) => validateLegacyIdentity(account).principal.id
                )
            );
            if (ids.size !== 1)
                throw new IdentityConsistencyError(
                    "Existing principals cannot be merged by backfill."
                );
            const { principal } = validateLegacyIdentity(existing[0]);
            if (
                principals.has(principal.id) ||
                principal.kind !== group.kind ||
                (principal.user?.studentId ?? null) !== group.studentId
            )
                throw new IdentityConsistencyError(
                    "Existing canonical identity conflicts with mapping."
                );
            principals.add(principal.id);
        }
    }
    return groups;
}

export async function backfillIdentities(
    prisma: PrismaClient,
    mappings: IdentityMapping[] = [],
    apply = false
) {
    return prisma.$transaction(
        async (tx) => {
            if (!apply) await tx.$executeRaw`SET TRANSACTION READ ONLY`;
            const accounts = await readLegacyIdentityAccounts(tx);
            const groups = planIdentityBackfill(accounts, mappings);
            const report = {
                authUsers: accounts.length,
                principals: groups.length,
                users: groups.filter(({ kind }) => kind === "HUMAN").length,
                services: groups.filter(({ kind }) => kind === "SERVICE")
                    .length,
                created: 0,
                existing: 0,
                apply
            };
            for (const group of groups) {
                if (group.accounts[0].authIdentity) {
                    report.existing++;
                    continue;
                }
                if (apply) {
                    const [principal] = await tx.$queryRaw<
                        Array<{ id: number }>
                    >`
                        INSERT INTO app."Principal" (kind, "updatedAt") VALUES (${group.kind}::app."PrincipalKind", now()) RETURNING id
                    `;
                    if (group.kind === "HUMAN") {
                        const [user] = await tx.$queryRaw<
                            Array<{ id: number }>
                        >`
                            INSERT INTO app."User" ("principalId", name, "studentId", "updatedAt")
                            VALUES (${principal!.id}, ${group.canonical.displayName}, ${group.studentId}, now()) RETURNING id
                        `;
                        const [fields] = await tx.$queryRaw<
                            Array<{ alias: boolean; contacts: boolean }>
                        >`
                            SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='app'
                                AND table_name='User' AND column_name='legacyStudentId') AS alias,
                                to_regclass('app."UserEmail"') IS NOT NULL AS contacts
                        `;
                        if (fields!.alias)
                            await tx.$executeRaw`UPDATE app."User" SET "legacyStudentId"=${group.studentId} WHERE id=${user!.id}`;
                        if (fields!.contacts) {
                            const emails = [
                                ...new Set(
                                    group.accounts
                                        .map(({ email }) =>
                                            email?.trim().toLowerCase()
                                        )
                                        .filter(
                                            (email): email is string => !!email
                                        )
                                )
                            ];
                            for (const email of emails)
                                await tx.$executeRaw`INSERT INTO app."UserEmail" ("userId", email, "updatedAt") VALUES (${user!.id}, ${email}, now()) ON CONFLICT DO NOTHING`;
                        }
                    } else {
                        await tx.$executeRaw`
                            INSERT INTO app."ServiceAccount" ("principalId", name, "updatedAt")
                            VALUES (${principal!.id}, ${group.canonical.displayName}, now())
                        `;
                    }
                    for (const account of group.accounts)
                        await tx.$executeRaw`
                            INSERT INTO app."AuthIdentity" ("principalId", issuer, subject, "legacyAuthUserId", "updatedAt")
                            VALUES (${principal!.id}, ${account.issuer}, ${account.subject}, ${account.id}, now())
                        `;
                    report.created++;
                }
            }
            return report;
        },
        { isolationLevel: "Serializable", timeout: 30000 }
    );
}

export function localIdentityDatabaseUrl(value: string | undefined) {
    if (!value)
        throw new Error(
            "POMI_IAM_LOCAL_DATABASE_URL is required; DATABASE_URL is never used."
        );
    const url = new URL(value);
    if (
        !["postgresql:", "postgres:"].includes(url.protocol) ||
        !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
        url.port === "5433" ||
        !/^\/[a-zA-Z0-9_]+_test$/.test(url.pathname) ||
        url.search ||
        url.hash
    )
        throw new Error(
            "Identity backfill requires a local *_test database outside the homologation tunnel."
        );
    return url.href;
}
