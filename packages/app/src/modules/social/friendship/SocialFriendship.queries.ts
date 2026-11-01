import { personSelection } from "../SocialPerson.queries.js";

export const friendshipSelection = {
    include: {
        studentA: { select: personSelection },
        studentB: { select: personSelection }
    }
} as const;
