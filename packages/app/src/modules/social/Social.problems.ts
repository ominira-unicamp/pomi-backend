import {
    ResourceNotFoundProblem,
    UniqueConstraintConflictProblem,
    problemResponse,
    type ProblemResponseMap
} from "@pomi/api-core";
import type { AcceptFriendshipFailure } from "./friendship/AcceptFriendship.use-case.js";

export const socialNotFoundProblem = (detail: string) =>
    ResourceNotFoundProblem.create({ detail });
export const socialConflictProblem = (detail: string) =>
    UniqueConstraintConflictProblem.create({ detail, fields: [] });
export type SocialProblem =
    | ReturnType<typeof socialNotFoundProblem>
    | ReturnType<typeof socialConflictProblem>;
export const socialProblemResponses = {
    [ResourceNotFoundProblem.type]: problemResponse(ResourceNotFoundProblem),
    [UniqueConstraintConflictProblem.type]: problemResponse(
        UniqueConstraintConflictProblem
    )
} satisfies ProblemResponseMap<SocialProblem, object>;

export function toAcceptFriendshipProblem(
    failure: AcceptFriendshipFailure
): SocialProblem {
    switch (failure.kind) {
        case "not-found":
            return socialNotFoundProblem("A solicitação não foi encontrada.");
        case "cannot-accept":
            return socialConflictProblem(
                "A solicitação não pode ser aceita por este aluno."
            );
        case "concurrent-change":
            return socialConflictProblem(
                "A solicitação já foi alterada e não pode mais ser aceita."
            );
    }
}
