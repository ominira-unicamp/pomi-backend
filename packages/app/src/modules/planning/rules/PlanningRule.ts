import { err, ok, type Result } from "@pomi/api-core";

export type PlanningIssue = { code: string; path: string[]; message: string };
export type EvaluationMode = "GRADE_AND_ATTENDANCE" | "ATTENDANCE" | "CONCEPT";
export type AttemptStatus =
    | "ENROLLED"
    | "DROPPED"
    | "APPROVED"
    | "FAILED_BY_GRADE"
    | "APPROVED_BY_ATTENDANCE"
    | "APPROVED_BY_PROFICIENCY"
    | "FAILED_BY_ATTENDANCE"
    | "SUFFICIENT"
    | "INSUFFICIENT";
export type YearPeriod =
    | "SUMMER"
    | "FIRST_SEMESTER"
    | "WINTER"
    | "SECOND_SEMESTER";
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
