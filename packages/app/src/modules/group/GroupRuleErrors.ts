import { ConflictError, type Result } from "@pomi/api-core";

export type GroupRuleIssue = { code: string; message: string };

export function requireGroupRule(result: Result<unknown, GroupRuleIssue>) {
    if (result.isErr()) throw new ConflictError(result.error.message);
}
