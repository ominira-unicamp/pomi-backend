import type { Principal } from "#/Principal.js";
import type { MyPrisma, StudentCapability } from "@pomi/db";

export async function hasStudentAccess(
    db: Pick<MyPrisma.TransactionClient, "authUser" | "botGrant">,
    actor: Principal | undefined,
    studentId: number,
    capability: StudentCapability
) {
    if (!actor) return false;
    const user = await db.authUser.findUnique({
        where: { id: actor.authUserId },
        select: {
            status: true,
            studentId: true,
            roles: { select: { role: true } }
        }
    });
    if (!user || user.status !== "ACTIVE") return false;
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
