import type { Principal } from "#/Principal.js";
import {
    canonicalIdentity,
    canonicalIdentityInclude,
    type MyPrisma,
    type StudentCapability
} from "@pomi/db";

type AccessDatabase = Pick<
    MyPrisma.TransactionClient,
    "authUser" | "botGrant" | "user"
>;

export async function hasUserAccess(
    db: AccessDatabase,
    actor: Principal | undefined,
    userId: number,
    capability: StudentCapability
) {
    if (!actor) return false;
    const credential = await db.authUser.findUnique({
        where: { id: actor.authUserId },
        include: { ...canonicalIdentityInclude, roles: true }
    });
    if (!credential || credential.status !== "ACTIVE") return false;
    const canonical = canonicalIdentity(credential);
    if (canonical.principal.status !== "ACTIVE") return false;
    if (credential.roles.some(({ role }) => role === "ADMIN")) return true;
    if (canonical.principal.user?.id === userId) return true;
    if (!credential.roles.some(({ role }) => role === "BOT")) return false;
    return !!(await db.botGrant.findFirst({
        where: {
            userId,
            botAuthUserId: actor.authUserId,
            capability,
            revokedAt: null
        },
        select: { id: true }
    }));
}

export async function hasStudentAccess(
    db: AccessDatabase,
    actor: Principal | undefined,
    studentId: number,
    capability: StudentCapability
) {
    const owner = await db.user.findUnique({
        where: { studentId },
        select: { id: true }
    });
    return !!owner && hasUserAccess(db, actor, owner.id, capability);
}
