import { err, ok } from "@pomi/api-core";
import type { GroupRuleIssue } from "../Group.errors.js";

export type GovernanceChange =
    | {
          kind: "change-membership";
          membershipId: number;
          leave: boolean;
          addRoleIds: readonly number[];
          removeRoleIds: readonly number[];
      }
    | { kind: "remove-manager-permission"; roleId: number };

export function validateManagerRetention(
    assignments: readonly { membershipId: number; roleId: number }[],
    change: GovernanceChange,
    addedManagerRoleIds: readonly number[] = []
) {
    const remains =
        assignments.some((assignment) => {
            if (change.kind === "remove-manager-permission")
                return assignment.roleId !== change.roleId;
            return (
                assignment.membershipId !== change.membershipId ||
                (!change.leave &&
                    !change.removeRoleIds.includes(assignment.roleId))
            );
        }) ||
        (change.kind === "change-membership" &&
            !change.leave &&
            change.addRoleIds.some((id) => addedManagerRoleIds.includes(id)));
    return remains
        ? ok(undefined)
        : err<never, GroupRuleIssue>({
              code: "MANAGER_REQUIRED",
              message: "O grupo precisa manter um gestor de roles."
          });
}
