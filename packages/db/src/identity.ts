import type {
    AuthRole,
    Capability,
    Prisma as MyPrisma,
    PrismaClient
} from "../prisma/generated/client.js";

export const canonicalIdentityInclude = {
    principal: { include: { user: true, serviceAccount: true } }
} as const;

export type CanonicalIdentityRecord = MyPrisma.AuthIdentityGetPayload<{
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

export function canonicalIdentity(identity: CanonicalIdentityRecord) {
    const principal = identity.principal;
    if (
        !principal ||
        (principal.kind === "HUMAN" &&
            (!principal.user || principal.serviceAccount)) ||
        (principal.kind === "SERVICE" &&
            (!principal.serviceAccount || principal.user))
    )
        throw new IdentityConsistencyError();
    return { identity, principal };
}

type IdentityInput = {
    issuer: string;
    subject: string;
    displayName?: string | null;
    email?: string | null;
    studentId?: number | null;
    roles: readonly { role: AuthRole }[];
    capabilities?: readonly { capability: Capability }[];
};

export async function createCanonicalIdentity(
    tx: MyPrisma.TransactionClient,
    input: IdentityInput,
    kind = classifyIdentity(input.roles)
) {
    const studentId = input.studentId ?? null;
    if (kind === "SERVICE" && studentId !== null)
        throw new IdentityConsistencyError(
            "A service identity cannot own a student profile."
        );
    const academicUser =
        kind === "HUMAN" && studentId !== null
            ? await tx.user.findUnique({
                  where: { studentId },
                  include: {
                      principal: {
                          include: { identities: true, serviceAccount: true }
                      }
                  }
              })
            : null;
    if (
        academicUser &&
        (academicUser.principal.kind !== "HUMAN" ||
            academicUser.principal.status !== "ACTIVE" ||
            academicUser.principal.serviceAccount ||
            academicUser.principal.identities.length)
    )
        throw new IdentityConsistencyError(
            "Academic user is already claimed or unavailable."
        );
    const email = input.email?.trim().toLowerCase();
    const identity = await tx.authIdentity.create({
        data: {
            issuer: input.issuer,
            subject: input.subject,
            email: input.email,
            displayName: input.displayName,
            roles: { create: input.roles.map(({ role }) => ({ role })) },
            capabilities: {
                create: input.capabilities?.map(({ capability }) => ({
                    capability
                }))
            },
            principal: academicUser
                ? { connect: { id: academicUser.principalId } }
                : {
                      create: {
                          kind,
                          ...(kind === "HUMAN"
                              ? {
                                    user: {
                                        create: {
                                            name: input.displayName,
                                            studentId,
                                            emails: email
                                                ? { create: { email } }
                                                : undefined
                                        }
                                    }
                                }
                              : {
                                    serviceAccount: {
                                        create: { name: input.displayName }
                                    }
                                })
                      }
                  }
        },
        include: {
            ...canonicalIdentityInclude,
            roles: true,
            capabilities: true
        }
    });
    if (academicUser && email)
        await tx.userEmail.upsert({
            where: { userId_email: { userId: academicUser.id, email } },
            create: { userId: academicUser.id, email },
            update: {}
        });
    return identity;
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
        const existing = await tx.authIdentity.findUnique({
            where: { issuer_subject: { issuer, subject } },
            include: canonicalIdentityInclude
        });
        if (!existing)
            return createCanonicalIdentity(
                tx,
                { issuer, subject, roles: [{ role: "ADMIN" }] },
                "HUMAN"
            );
        canonicalIdentity(existing);
        await tx.authIdentityRole.upsert({
            where: {
                authIdentityId_role: {
                    authIdentityId: existing.id,
                    role: "ADMIN"
                }
            },
            create: { authIdentityId: existing.id, role: "ADMIN" },
            update: {}
        });
        return tx.authIdentity.update({
            where: { id: existing.id },
            data: { status: "ACTIVE" }
        });
    });
}
