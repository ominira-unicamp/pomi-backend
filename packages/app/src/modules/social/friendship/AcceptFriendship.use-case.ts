import type { Clock } from "#/application/Clock.js";
import { err, ok, type Result } from "@pomi/api-core";
import type { PrismaClient } from "@pomi/db";
import type z from "zod";
import type { friendship } from "../Social.schemas.js";
import { buildFriendship } from "./SocialFriendship.presenter.js";
import { friendshipSelection } from "./SocialFriendship.queries.js";
export type AcceptFriendshipFailure =
    | { kind: "not-found" }
    | { kind: "cannot-accept" }
    | { kind: "concurrent-change" };

export async function acceptFriendship(
    { prisma, clock }: { prisma: PrismaClient; clock: Clock },
    { userId, friendshipId }: { userId: number; friendshipId: number }
): Promise<Result<z.infer<typeof friendship>, AcceptFriendshipFailure>> {
    const existing = await prisma.studentFriendship.findFirst({
        where: {
            id: friendshipId,
            OR: [{ userAId: userId }, { userBId: userId }]
        },
        select: { status: true, requestedByUserId: true }
    });
    if (!existing) return err({ kind: "not-found" });

    if (existing.status !== "PENDING" || existing.requestedByUserId === userId)
        return err({ kind: "cannot-accept" });

    const updated = await prisma.studentFriendship.updateMany({
        where: {
            id: friendshipId,
            status: "PENDING",
            requestedByUserId: { not: userId },
            OR: [{ userAId: userId }, { userBId: userId }]
        },
        data: { status: "ACCEPTED", acceptedAt: clock.now() }
    });
    if (!updated.count) return err({ kind: "concurrent-change" });

    const row = await prisma.studentFriendship.findUnique({
        where: { id: friendshipId },
        ...friendshipSelection
    });
    return row ? ok(buildFriendship(row, userId)) : err({ kind: "not-found" });
}
