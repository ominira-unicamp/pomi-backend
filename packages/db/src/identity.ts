import type {
    Prisma as MyPrisma,
    PrismaClient
} from "../prisma/generated/client.js";

export const canonicalIdentityInclude = {
    authIdentity: {
        include: {
            principal: { include: { user: true, serviceAccount: true } }
        }
    }
} as const;

export type LegacyIdentity = MyPrisma.AuthUserGetPayload<{
    include: typeof canonicalIdentityInclude;
}>;
export type IdentityKind = "HUMAN" | "SERVICE";

export class IdentityConsistencyError extends Error {
    constructor(message = "Canonical identity is missing or inconsistent.") {
        super(message);
        this.name = "IdentityConsistencyError";
    }
}

export function classifyIdentity(
    roles: readonly { role: string }[]
): IdentityKind {
    const bot = roles.some(({ role }) => role === "BOT");
    if (bot && roles.some(({ role }) => role !== "BOT"))
        throw new IdentityConsistencyError(
            "Mixed BOT roles require explicit classification."
        );
    return bot ? "SERVICE" : "HUMAN";
}

export function canonicalIdentity(authUser: LegacyIdentity) {
    const identity = authUser.authIdentity;
    const principal = identity?.principal;
    if (
        !identity ||
        !principal ||
        identity.legacyAuthUserId !== authUser.id ||
        identity.issuer !== authUser.issuer ||
        identity.subject !== authUser.subject ||
        (principal.kind === "HUMAN" &&
            (!principal.user || principal.serviceAccount)) ||
        (principal.kind === "SERVICE" &&
            (!principal.serviceAccount || principal.user)) ||
        (authUser.studentId !== null &&
            principal.user?.studentId !== authUser.studentId)
    )
        throw new IdentityConsistencyError();
    return { identity, principal };
}

export async function createCanonicalIdentity(
    tx: MyPrisma.TransactionClient,
    authUser: {
        id: number;
        issuer: string;
        subject: string;
        displayName: string | null;
        email?: string | null;
        studentId: number | null;
        roles: readonly { role: string }[];
    },
    kind = classifyIdentity(authUser.roles)
) {
    if (kind === "SERVICE" && authUser.studentId !== null)
        throw new IdentityConsistencyError(
            "A service identity cannot own a student profile."
        );
    if (kind === "HUMAN" && authUser.studentId !== null) {
        const academicUser = await tx.user.findUnique({
            where: { studentId: authUser.studentId },
            include: {
                principal: {
                    include: { identities: true, serviceAccount: true }
                }
            }
        });
        if (academicUser) {
            if (
                academicUser.principal.kind !== "HUMAN" ||
                academicUser.principal.status !== "ACTIVE" ||
                academicUser.principal.serviceAccount ||
                academicUser.principal.identities.length
            )
                throw new IdentityConsistencyError(
                    "Academic user is already claimed or unavailable."
                );
            await tx.authIdentity.create({
                data: {
                    principalId: academicUser.principalId,
                    issuer: authUser.issuer,
                    subject: authUser.subject,
                    legacyAuthUserId: authUser.id
                }
            });
            if (authUser.email?.trim()) {
                const email = authUser.email.trim().toLowerCase();
                await tx.userEmail.upsert({
                    where: { userId_email: { userId: academicUser.id, email } },
                    create: { userId: academicUser.id, email },
                    update: {}
                });
            }
            return tx.principal.findUniqueOrThrow({
                where: { id: academicUser.principalId }
            });
        }
    }
    return tx.principal.create({
        data: {
            kind,
            ...(kind === "HUMAN"
                ? {
                      user: {
                          create: {
                              name: authUser.displayName,
                              studentId: authUser.studentId,
                              legacyStudentId: authUser.studentId,
                              emails: authUser.email?.trim()
                                  ? {
                                        create: {
                                            email: authUser.email
                                                .trim()
                                                .toLowerCase()
                                        }
                                    }
                                  : undefined
                          }
                      }
                  }
                : {
                      serviceAccount: { create: { name: authUser.displayName } }
                  }),
            identities: {
                create: {
                    issuer: authUser.issuer,
                    subject: authUser.subject,
                    legacyAuthUserId: authUser.id
                }
            }
        }
    });
}

export async function linkCanonicalStudent(
    tx: MyPrisma.TransactionClient,
    authUserId: number,
    studentId: number
) {
    const authUser = await tx.authUser.findUniqueOrThrow({
        where: { id: authUserId },
        include: canonicalIdentityInclude
    });
    const { principal } = canonicalIdentity({ ...authUser, studentId: null });
    if (
        !principal.user ||
        (principal.user.studentId !== null &&
            principal.user.studentId !== studentId)
    )
        throw new IdentityConsistencyError(
            "Student association conflicts with canonical user."
        );
    await tx.user.update({
        where: { id: principal.user.id },
        data: { studentId, legacyStudentId: studentId }
    });
}

export async function runIdentityTransaction<T>(
    prisma: PrismaClient,
    work: (tx: MyPrisma.TransactionClient) => Promise<T>
): Promise<T> {
    for (let attempt = 0; ; attempt++) {
        try {
            return await prisma.$transaction(work, {
                isolationLevel: "Serializable",
                timeout: 15000
            });
        } catch (error) {
            const code = (error as { code?: string }).code;
            if (attempt >= 3 || (code !== "P2002" && code !== "P2034"))
                throw error;
        }
    }
}

export async function ensureAdministratorIdentity(
    prisma: PrismaClient,
    issuer: string,
    subject: string
) {
    return runIdentityTransaction(prisma, async (tx) => {
        const existing = await tx.authUser.findUnique({
            where: { issuer_subject: { issuer, subject } },
            include: canonicalIdentityInclude
        });
        if (existing) canonicalIdentity(existing);
        const authUser = await tx.authUser.upsert({
            where: { issuer_subject: { issuer, subject } },
            create: { issuer, subject, roles: { create: { role: "ADMIN" } } },
            update: { status: "ACTIVE" }
        });
        await tx.authUserRole.upsert({
            where: {
                authUserId_role: { authUserId: authUser.id, role: "ADMIN" }
            },
            create: { authUserId: authUser.id, role: "ADMIN" },
            update: {}
        });
        if (!existing)
            await createCanonicalIdentity(
                tx,
                { ...authUser, roles: [{ role: "ADMIN" }] },
                "HUMAN"
            );
        return authUser;
    });
}
