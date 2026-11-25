import type z from "zod";
import type { friendship } from "../Social.schemas.js";
import {
    buildPerson,
    decidePersonDisclosure
} from "../SocialPerson.presenter.js";
import type { SelectedPerson } from "../SocialPerson.queries.js";

type Friendship = z.infer<typeof friendship>;
type SelectedFriendship = {
    id: number;
    userAId: number;
    userBId: number;
    requestedByUserId: number;
    status: "PENDING" | "ACCEPTED";
    acceptedAt: Date | null;
    createdAt: Date;
    userA: SelectedPerson;
    userB: SelectedPerson;
};

export function buildFriendship(
    row: SelectedFriendship,
    userId: number
): Friendship {
    const friend = row.userAId === userId ? row.userB : row.userA;
    return {
        id: row.id,
        status: row.status,
        direction:
            row.status === "ACCEPTED"
                ? "NONE"
                : row.requestedByUserId === userId
                  ? "OUTGOING"
                  : "INCOMING",
        friend: buildPerson(
            friend,
            decidePersonDisclosure({
                profileEnabled: friend.publicProfileEnabled,
                forceMinimal: !friend.publicProfileEnabled,
                isOwner: friend.id === userId,
                currentCoursesVisibility: friend.currentCoursesVisibility,
                acceptedFriend: row.status === "ACCEPTED"
            })
        ),
        createdAt: row.createdAt.toISOString(),
        acceptedAt: row.acceptedAt?.toISOString() ?? null
    };
}
