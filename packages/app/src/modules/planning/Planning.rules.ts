import { err, ok, type Result } from "@pomi/api-core";

export type PlanningIssue = { code: string; path: string[]; message: string };
export function planningRule(fields: PlanningIssue[]) {
    return fields.length ? err(fields) : ok(undefined);
}
export function planningIssues(
    result: Result<unknown, PlanningIssue[]>
): PlanningIssue[] {
    return result.isErr() ? result.error : [];
}
export function missingCourseIssues(
    ids: readonly number[],
    found: ReadonlySet<number>,
    path: readonly string[]
): PlanningIssue[] {
    return [...new Set(ids)]
        .filter((id) => !found.has(id))
        .map((id) => ({
            code: "REFERENCE_NOT_FOUND",
            path: [...path, String(id)],
            message: `A disciplina ${id} não foi encontrada.`
        }));
}
