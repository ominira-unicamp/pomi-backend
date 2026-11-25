import type { Principal } from "#/Principal.js";
import {
    canonicalIdentity,
    canonicalIdentityInclude,
    type MyPrisma,
    type UserCapability
} from "@pomi/db";
type AccessDatabase = Pick<
    MyPrisma.TransactionClient,
    "authIdentity" | "botGrant"
>;
export async function hasUserAccess(
    db: AccessDatabase,
    actor: Principal | undefined,
    userId: number,
    capability: UserCapability
) {
    if (!actor) return false;
    const credential = await db.authIdentity.findUnique({
        where: { id: actor.authIdentityId },
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
            botAuthIdentityId: actor.authIdentityId,
            capability,
            revokedAt: null
        },
        select: { id: true }
    }));
}
