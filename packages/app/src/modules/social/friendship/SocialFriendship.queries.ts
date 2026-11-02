import { personSelection } from "../SocialPerson.queries.js";

export const friendshipSelection = {
    include: {
        userA: { select: personSelection },
        userB: { select: personSelection }
    }
} as const;
