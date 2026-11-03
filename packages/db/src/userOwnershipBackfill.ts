import { createHash } from "node:crypto";
import {
    Prisma as MyPrisma,
    type PrismaClient
} from "../prisma/generated/client.js";
import {
    readLegacyIdentityAccounts,
    validateLegacyIdentity
} from "./legacyIdentityMigration.js";

export const userOwnershipTables = [
    "StudentTagInterest",
    "ExchangeNoticeSubscription",
    "ExchangeNoticeDelivery",
    "BotGrant",
    "StudentCourseAttempt",
    "ProfessorEvaluation",
    "Curriculum",
    "PeriodPlanning",
    "GroupMembership"
] as const;

const profileFields = [
    "publicId",
    "publicProfileEnabled",
    "publicDisplayName",
    "publicBio",
    "currentCoursesVisibility",
    "avatarMediaId",
    "avatarRevision",
    "favoriteCurriculumId"
] as const;

type LegacyStudent = {
    id: number;
    name: string;
    publicId: string;
    publicProfileEnabled: boolean;
    publicDisplayName: string | null;
    publicBio: string | null;
    currentCoursesVisibility: "PRIVATE" | "FRIENDS" | "PUBLIC";
    avatarMediaId: string | null;
    avatarRevision: number;
    favoriteCurriculumId: number | null;
};

type MigrationOptions = Readonly<{
    apply?: boolean;
    expectedSourceDigest?: string;
}>;

export function normalizeUserEmail(email: string) {
    return email.trim().toLowerCase();
}

export async function inspectUserOwnershipState(
    tx: Pick<MyPrisma.TransactionClient, "$queryRaw">,
    legacyProfile = false
) {
    const tables = [
        "Student",
        "AuthUser",
        "AuthIdentity",
        "AuthUserRole",
        "AuthUserCapability",
        ...userOwnershipTables,
        "StudentFriendship",
        "GroupInvitation",
        "FeedbackReport",
        "ExchangeNoticeSubscriptionPlace"
    ];
    const removedFields = [
        ...profileFields,
        "studentId",
        "userId",
        "studentAId",
        "studentBId",
        "requestedById",
        "userAId",
        "userBId",
        "requestedByUserId",
        "recipientStudentId",
        "inviterStudentId",
        "recipientUserId",
        "inviterUserId",
        "reporterStudentId",
        "reporterUserId",
        "subscriptionStudentId",
        "subscriptionUserId"
    ];
    const hash = createHash("sha256");
    const counts: Record<string, number> = {};
    for (const table of tables) {
        const rows = await tx.$queryRaw<Array<{ value: string }>>(MyPrisma.sql`
            SELECT (to_jsonb(t) - ARRAY[${MyPrisma.join(removedFields)}]::text[])::text AS value
            FROM ${MyPrisma.raw(`app."${table}"`)} t ORDER BY value
        `);
        counts[table] = rows.length;
        hash.update(table);
        for (const row of rows) hash.update(row.value);
    }
    const table = legacyProfile ? "Student" : "User";
    const key = legacyProfile ? "id" : "studentId";
    const profile = await tx.$queryRaw<Array<{ value: string }>>(MyPrisma.sql`
        SELECT jsonb_build_array(${MyPrisma.raw(`t."${key}"`)},
            ${MyPrisma.join(profileFields.map((field) => MyPrisma.raw(`t."${field}"`)))})::text AS value
        FROM ${MyPrisma.raw(`app."${table}"`)} t
        WHERE ${MyPrisma.raw(`t."${key}"`)} IS NOT NULL ORDER BY ${MyPrisma.raw(`t."${key}"`)}
    `);
    const profileHash = createHash("sha256");
    for (const row of profile) profileHash.update(row.value);
    return {
        preservedDataDigest: hash.digest("hex"),
        academicProfileDigest: profileHash.digest("hex"),
        preservedCounts: counts
    };
}

async function sourceSnapshot(tx: MyPrisma.TransactionClient) {
    const tables = [
        "Student",
        "User",
        "AuthUser",
        "AuthIdentity",
        ...userOwnershipTables,
        "StudentFriendship",
        "GroupInvitation",
        "FeedbackReport",
        "ExchangeNoticeSubscriptionPlace"
    ];
    const hash = createHash("sha256");
    const counts: Record<string, number> = {};
    for (const table of tables) {
        const rows = await tx.$queryRaw<Array<{ value: string }>>(MyPrisma.sql`
            SELECT row_to_json(t)::text AS value FROM ${MyPrisma.raw(`app."${table}"`)} t
            ORDER BY row_to_json(t)::text
        `);
        counts[table] = rows.length;
        hash.update(table);
        for (const row of rows) hash.update(row.value);
    }
    return { sourceDigest: hash.digest("hex"), counts };
}

async function validateOwnership(tx: MyPrisma.TransactionClient) {
    for (const table of userOwnershipTables) {
        const invalid = await tx.$queryRaw<
            Array<{ count: bigint }>
        >(MyPrisma.sql`
            SELECT count(*) AS count FROM ${MyPrisma.raw(`app."${table}"`)} t
            LEFT JOIN app."User" u ON u."studentId" = t."studentId"
            WHERE t."userId" IS NULL OR t."userId" IS DISTINCT FROM u.id
        `);
        if (invalid[0]!.count !== 0n)
            throw new Error(`Invalid user ownership in ${table}.`);
    }
    const [invalid] = await tx.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*) AS count FROM app."StudentFriendship" f
        LEFT JOIN app."User" a ON a."studentId" = f."studentAId"
        LEFT JOIN app."User" b ON b."studentId" = f."studentBId"
        LEFT JOIN app."User" r ON r."studentId" = f."requestedById"
        WHERE f."userAId" IS DISTINCT FROM LEAST(a.id,b.id)
           OR f."userBId" IS DISTINCT FROM GREATEST(a.id,b.id)
           OR f."requestedByUserId" IS DISTINCT FROM r.id
           OR r.id NOT IN (a.id,b.id)
    `;
    if (invalid!.count !== 0n)
        throw new Error("Invalid user friendship ownership.");
    for (const [table, legacy, canonical] of [
        ["FeedbackReport", "reporterStudentId", "reporterUserId"],
        ["GroupInvitation", "recipientStudentId", "recipientUserId"],
        ["GroupInvitation", "inviterStudentId", "inviterUserId"],
        [
            "ExchangeNoticeSubscriptionPlace",
            "subscriptionStudentId",
            "subscriptionUserId"
        ]
    ] as const) {
        const [invalid] = await tx.$queryRaw<
            Array<{ count: bigint }>
        >(MyPrisma.sql`
            SELECT count(*) AS count FROM ${MyPrisma.raw(`app."${table}"`)} t
            LEFT JOIN app."User" u ON u."studentId" = ${MyPrisma.raw(`t."${legacy}"`)}
            WHERE ${MyPrisma.raw(`t."${canonical}"`)} IS DISTINCT FROM u.id
        `);
        if (invalid!.count !== 0n)
            throw new Error(`Invalid ${canonical} in ${table}.`);
    }
    const [profile] = await tx.$queryRaw<Array<{ count: bigint }>>(MyPrisma.sql`
        SELECT count(*) AS count FROM app."Student" s LEFT JOIN app."User" u ON u."studentId" = s.id
        WHERE u.id IS NULL OR u."legacyStudentId" IS DISTINCT FROM s.id OR
            ROW(${MyPrisma.join(profileFields.map((field) => MyPrisma.raw(`s."${field}"`)))}) IS DISTINCT FROM
            ROW(${MyPrisma.join(profileFields.map((field) => MyPrisma.raw(`u."${field}"`)))})
    `);
    if (profile!.count !== 0n)
        throw new Error("Academic profile was not fully preserved in User.");
    const [favorite] = await tx.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*) AS count FROM app."User" u JOIN app."Curriculum" c ON c.id = u."favoriteCurriculumId"
        WHERE c."userId" IS DISTINCT FROM u.id
    `;
    if (favorite!.count !== 0n)
        throw new Error("Favorite curriculum belongs to another user.");
}

export async function backfillUserOwnership(
    prisma: PrismaClient,
    options: MigrationOptions = {}
) {
    return prisma.$transaction(
        async (tx) => {
            if (!options.apply) await tx.$executeRaw`SET TRANSACTION READ ONLY`;
            const credentials = await readLegacyIdentityAccounts(tx);
            for (const credential of credentials)
                validateLegacyIdentity(credential);
            const snapshot = {
                ...(await sourceSnapshot(tx)),
                ...(await inspectUserOwnershipState(tx, true))
            };
            if (
                options.expectedSourceDigest &&
                snapshot.sourceDigest !== options.expectedSourceDigest
            )
                throw new Error("Source changed since reviewed snapshot.");
            const students = await tx.$queryRaw<LegacyStudent[]>`
            SELECT id, name, "publicId", "publicProfileEnabled", "publicDisplayName", "publicBio",
                "currentCoursesVisibility", "avatarMediaId", "avatarRevision", "favoriteCurriculumId"
            FROM app."Student" ORDER BY id
        `;
            let createdUsers = 0;
            let copiedProfiles = 0;
            for (const student of students) {
                let user = await tx.user.findUnique({
                    where: { studentId: student.id }
                });
                if (!user) {
                    createdUsers++;
                    if (options.apply) {
                        const principal = await tx.principal.create({
                            data: {
                                kind: "HUMAN",
                                user: {
                                    create: {
                                        studentId: student.id,
                                        name: student.name
                                    }
                                }
                            },
                            include: { user: true }
                        });
                        user = principal.user!;
                    }
                }
                if (
                    !user ||
                    user.publicId !== student.publicId ||
                    user.legacyStudentId !== student.id
                ) {
                    copiedProfiles++;
                    if (options.apply && user) {
                        const profile = Object.fromEntries(
                            profileFields.map((field) => [
                                field,
                                student[field]
                            ])
                        );
                        await tx.user.update({
                            where: { id: user.id },
                            data: { ...profile, legacyStudentId: student.id }
                        });
                    }
                }
            }
            const emails = await tx.$queryRaw<
                Array<{ userId: number; email: string }>
            >`
            SELECT DISTINCT u.id AS "userId", lower(btrim(a.email)) AS email
            FROM app."User" u JOIN app."AuthIdentity" i ON i."principalId" = u."principalId"
            JOIN app."AuthUser" a ON a.id = i."legacyAuthUserId"
            WHERE a.email IS NOT NULL AND btrim(a.email) <> ''
        `;
            for (const { email } of emails)
                if (email.length > 320 || !/^[^\s@]+@[^\s@]+$/.test(email))
                    throw new Error(
                        "An existing contact email is invalid; review source before migration."
                    );
            if (options.apply) {
                for (const table of userOwnershipTables) {
                    await tx.$executeRaw(MyPrisma.sql`
                    UPDATE ${MyPrisma.raw(`app."${table}"`)} t SET "userId" = u.id
                    FROM app."User" u WHERE u."studentId" = t."studentId" AND t."userId" IS NULL
                `);
                }
                for (const [table, legacy, canonical] of [
                    ["FeedbackReport", "reporterStudentId", "reporterUserId"],
                    [
                        "GroupInvitation",
                        "recipientStudentId",
                        "recipientUserId"
                    ],
                    ["GroupInvitation", "inviterStudentId", "inviterUserId"],
                    [
                        "ExchangeNoticeSubscriptionPlace",
                        "subscriptionStudentId",
                        "subscriptionUserId"
                    ]
                ] as const)
                    await tx.$executeRaw(MyPrisma.sql`
                UPDATE ${MyPrisma.raw(`app."${table}"`)} t SET ${MyPrisma.raw(`"${canonical}"`)} = u.id
                FROM app."User" u WHERE u."studentId" = ${MyPrisma.raw(`t."${legacy}"`)}
                  AND ${MyPrisma.raw(`t."${canonical}"`)} IS NULL
            `);
                await tx.$executeRaw`
                UPDATE app."StudentFriendship" f SET "userAId" = LEAST(a.id,b.id),
                    "userBId" = GREATEST(a.id,b.id), "requestedByUserId" = r.id
                FROM app."User" a, app."User" b, app."User" r
                WHERE a."studentId" = f."studentAId" AND b."studentId" = f."studentBId"
                  AND r."studentId" = f."requestedById" AND f."userAId" IS NULL
            `;
                for (const { userId, email } of emails)
                    await tx.userEmail.upsert({
                        where: { userId_email: { userId, email } },
                        create: { userId, email },
                        update: {}
                    });
                await validateOwnership(tx);
            }
            return {
                ...snapshot,
                apply: options.apply ?? false,
                createdUsers,
                copiedProfiles,
                distinctEmails: emails.length
            };
        },
        { isolationLevel: "Serializable", timeout: 120000 }
    );
}
