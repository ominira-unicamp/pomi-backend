import {
    ConflictError,
    ForbiddenError,
    NotFoundError,
    type Result
} from "@pomi/api-core";
import { checkGroupPermission } from "./access/Group.access.js";
import type { GroupRuleIssue } from "./Group.errors.js";
import type { PatchManagedGroupMembershipFailure } from "./membership/PatchManagedGroupMembership.use-case.js";
import type { PatchGroupRoleFailure } from "./role/PatchGroupRole.use-case.js";

export function unwrapGroupMutation<Value>(
    result: Result<
        Value,
        PatchGroupRoleFailure | PatchManagedGroupMembershipFailure
    >
): Value {
    if (result.isOk()) return result.value;
    switch (result.error.kind) {
        case "not-found":
            throw new NotFoundError(result.error.message);
        case "forbidden":
            throw new ForbiddenError(result.error.message);
        case "concurrent-change":
        case "conflict":
            throw new ConflictError(result.error.message);
    }
}

export function requireGroupRule(result: Result<unknown, GroupRuleIssue>) {
    if (result.isErr()) throw new ConflictError(result.error.message);
}

export async function requirePermission(
    ...args: Parameters<typeof checkGroupPermission>
) {
    const result = await checkGroupPermission(...args);
    if (result.isErr()) {
        if (result.error.kind === "not-found")
            throw new NotFoundError(result.error.message);
        throw new ForbiddenError(result.error.message);
    }
}
