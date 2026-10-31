import { err, ok } from "@pomi/api-core";
import type { GroupRuleIssue } from "../GroupRuleErrors.js";

export function validateRolePermissions(
    added: readonly string[],
    removed: readonly string[] = []
) {
    const permissions = [...added, ...removed];
    return permissions.length !== new Set(permissions).size
        ? err<never, GroupRuleIssue>({
              code: "DUPLICATE_PERMISSION",
              message: "Permissão repetida."
          })
        : ok(undefined);
}
