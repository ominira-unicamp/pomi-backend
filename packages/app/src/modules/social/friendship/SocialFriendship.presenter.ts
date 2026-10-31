import type z from "zod";
import type { friendship } from "../Social.schemas.js";
import { buildPerson } from "../SocialPerson.presenter.js";
import type { SelectedPerson } from "../SocialPerson.queries.js";

type Friendship = z.infer<typeof friendship>;
type SelectedFriendship = {
    id: number;
    studentAId: number;
    studentBId: number;
    requestedById: number;
    status: "PENDING" | "ACCEPTED";
    acceptedAt: Date | null;
    createdAt: Date;
    studentA: SelectedPerson;
    studentB: SelectedPerson;
};

export function buildFriendship(
    row: SelectedFriendship,
    studentId: number
): Friendship {
    const friend = row.studentAId === studentId ? row.studentB : row.studentA;
    return {
        id: row.id,
        status: row.status,
        direction:
            row.status === "ACCEPTED"
                ? "NONE"
                : row.requestedById === studentId
                  ? "OUTGOING"
                  : "INCOMING",
        friend: buildPerson(
            friend,
            studentId,
            !friend.publicProfileEnabled,
            row.status === "ACCEPTED" ? new Set([friend.id]) : undefined
        ),
        createdAt: row.createdAt.toISOString(),
        acceptedAt: row.acceptedAt?.toISOString() ?? null
    };
}
