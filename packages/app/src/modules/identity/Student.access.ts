import type { Principal } from "#/Principal.js";
import {
    canonicalIdentity,
    canonicalIdentityInclude,
    type MyPrisma,
    type StudentCapability
} from "@pomi/db";

export async function hasStudentAccess(
    db: Pick<MyPrisma.TransactionClient, "authUser" | "botGrant">,
    actor: Principal | undefined,
    studentId: number,
    capability: StudentCapability
) {
    if (!actor) return false;
    const user = await db.authUser.findUnique({
        where: { id: actor.authUserId },
        include: { ...canonicalIdentityInclude, roles: true }
    });
    if (!user || user.status !== "ACTIVE") return false;
    if (canonicalIdentity(user).principal.status !== "ACTIVE") return false;
    if (user.roles.some(({ role }) => role === "ADMIN")) return true;
    if (user.studentId === studentId) return true;
    if (!user.roles.some(({ role }) => role === "BOT")) return false;
    return !!(await db.botGrant.findFirst({
        where: {
            studentId,
            botAuthUserId: actor.authUserId,
            capability,
            revokedAt: null
        },
        select: { id: true }
    }));
}
