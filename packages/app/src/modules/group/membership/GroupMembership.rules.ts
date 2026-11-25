import { err, ok } from "@pomi/api-core";
import type { GroupRuleIssue } from "../Group.errors.js";

export type PositionChange = {
    id?: number;
    startedAt?: string | null;
    endedAt?: string | null;
};

export function validateMembershipVisibility(
    activeKey: string | null,
    isPublic: boolean
) {
    return activeKey !== "ACTIVE" && isPublic
        ? err<never, GroupRuleIssue>({
              code: "ENDED_MEMBERSHIP_VISIBILITY",
              message: "Vínculo encerrado não pode ser publicado."
          })
        : ok(undefined);
}
export function validateActiveMembership(activeKey: string | null) {
    return activeKey !== "ACTIVE"
        ? err<never, GroupRuleIssue>({
              code: "ENDED_MEMBERSHIP",
              message: "Vínculo encerrado."
          })
        : ok(undefined);
}
export function validateRoleAssignments(ids: readonly number[]) {
    return ids.length !== new Set(ids).size
        ? err<never, GroupRuleIssue>({
              code: "DUPLICATE_ROLE",
              message: "Role repetida na requisição."
          })
        : ok(undefined);
}
export function validatePositionOperations(ids: readonly number[]) {
    return ids.length !== new Set(ids).size
        ? err<never, GroupRuleIssue>({
              code: "DUPLICATE_POSITION",
              message: "Cargo repetido na requisição."
          })
        : ok(undefined);
}
export function validatePositionDates(
    existing: readonly {
        id: number;
        startedAt: Date | null;
        endedAt: Date | null;
    }[],
    changes: readonly PositionChange[]
) {
    for (const position of changes) {
        const previous =
            "id" in position
                ? existing.find(({ id }) => id === position.id)
                : undefined;
        const start =
            position.startedAt === undefined
                ? previous?.startedAt
                : position.startedAt && new Date(position.startedAt);
        const end =
            position.endedAt === undefined
                ? previous?.endedAt
                : position.endedAt && new Date(position.endedAt);
        if (start && end && end < start)
            return err<never, GroupRuleIssue>({
                code: "INVALID_POSITION_DATES",
                message: "Fim do cargo anterior ao início."
            });
    }
    return ok(undefined);
}
