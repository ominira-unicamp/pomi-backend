import type { AttemptStatus } from "#/modules/planning/rules/PlanningRule.js";
import { err, ok } from "@pomi/api-core";

export function isEligibleProfessorEvaluationAttempt(status: AttemptStatus) {
    return [
        "DROPPED",
        "APPROVED",
        "FAILED_BY_GRADE",
        "APPROVED_BY_ATTENDANCE",
        "APPROVED_BY_PROFICIENCY",
        "FAILED_BY_ATTENDANCE",
        "SUFFICIENT",
        "INSUFFICIENT"
    ].includes(status);
}

export function validateProfessorEvaluationFacts(facts: {
    classFound: boolean;
    professorFound: boolean;
    professorInClass: boolean;
    attemptStatus: AttemptStatus | null;
}) {
    const referenceFields = [] as Array<{
        code: string;
        path: string[];
        message: string;
    }>;
    if (!facts.classFound)
        referenceFields.push({
            code: "REFERENCE_NOT_FOUND",
            path: ["classId"],
            message: "A turma informada não foi encontrada."
        });
    if (!facts.professorFound)
        referenceFields.push({
            code: "REFERENCE_NOT_FOUND",
            path: ["professorId"],
            message: "O professor informado não foi encontrado."
        });
    if (referenceFields.length > 0)
        return err({ kind: "reference" as const, fields: referenceFields });

    if (!facts.professorInClass)
        return err({
            kind: "invalid" as const,
            fields: [
                {
                    code: "INVALID_VALUE",
                    path: ["professorId"],
                    message: "O professor deve pertencer à turma informada."
                }
            ]
        });

    return ok({
        eligible:
            facts.attemptStatus !== null &&
            isEligibleProfessorEvaluationAttempt(facts.attemptStatus)
    });
}
