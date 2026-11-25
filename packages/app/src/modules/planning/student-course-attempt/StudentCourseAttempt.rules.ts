import type {
    AttemptStatus,
    EvaluationMode
} from "#/modules/academic/Academic.types.js";
import { err, ok } from "@pomi/api-core";
import { planningRule, type PlanningIssue } from "../Planning.rules.js";
export type AttemptFactsInput = {
    courseId: number;
    studyPeriodId?: number | null;
    classId?: number | null;
    evaluationMode?: EvaluationMode;
    status: AttemptStatus;
    grade?: number | null;
};
export type AttemptClassFacts = {
    courseId: number;
    studyPeriod: { id: number; year: number };
};
type AttemptInput = AttemptFactsInput;
type AttemptResolution =
    | { kind: "reference"; fields: PlanningIssue[] }
    | { kind: "invalid"; fields: PlanningIssue[] }
    | {
          kind: "valid";
          evaluationMode: EvaluationMode;
          studyPeriodId: number | null;
      };
type ValidationIssue = PlanningIssue;
type CourseEvaluationMode = EvaluationMode;
function invalidField(path: string[], message: string): ValidationIssue {
    return { code: "INVALID_VALUE", path, message };
}
function requiredField(path: string[], message: string): ValidationIssue {
    return { code: "REQUIRED", path, message };
}
function evaluationIssues(
    input: AttemptInput,
    evaluationMode: CourseEvaluationMode
): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const grade = input.grade ?? null;
    const noResult = ["ENROLLED", "DROPPED"].includes(input.status);
    const allowedStatuses: Record<CourseEvaluationMode, string[]> = {
        GRADE_AND_ATTENDANCE: [
            "ENROLLED",
            "DROPPED",
            "APPROVED",
            "APPROVED_BY_PROFICIENCY",
            "FAILED_BY_GRADE",
            "FAILED_BY_ATTENDANCE"
        ],
        ATTENDANCE: [
            "ENROLLED",
            "DROPPED",
            "APPROVED_BY_ATTENDANCE",
            "APPROVED_BY_PROFICIENCY",
            "FAILED_BY_ATTENDANCE"
        ],
        CONCEPT: [
            "ENROLLED",
            "DROPPED",
            "APPROVED_BY_PROFICIENCY",
            "SUFFICIENT",
            "INSUFFICIENT"
        ]
    };
    if (!allowedStatuses[evaluationMode].includes(input.status))
        issues.push(
            invalidField(
                ["status"],
                "O resultado informado não é compatível com a modalidade de avaliação."
            )
        );
    if (input.status === "APPROVED_BY_PROFICIENCY" && grade !== null)
        issues.push(
            invalidField(
                ["grade"],
                "Uma disciplina aprovada por proficiência não possui nota numérica."
            )
        );
    if (noResult && grade !== null)
        issues.push(
            invalidField(
                ["grade"],
                "Tentativas cursando ou desistidas não possuem nota final."
            )
        );
    if (evaluationMode !== "GRADE_AND_ATTENDANCE" && grade !== null)
        issues.push(
            invalidField(
                ["grade"],
                "A modalidade de avaliação não aceita nota numérica."
            )
        );
    return issues;
}
export function validateEvaluation(
    input: AttemptFactsInput,
    evaluationMode: EvaluationMode
) {
    return planningRule(evaluationIssues(input, evaluationMode));
}
function resolveAttempt(
    input: AttemptFactsInput,
    facts: {
        courseFound: boolean;
        periodFound: boolean;
        classData: AttemptClassFacts | null | undefined;
        catalogCourse?: { evaluation: EvaluationMode | null } | null;
    }
): AttemptResolution {
    const fields: ValidationIssue[] = [];
    const { courseFound, periodFound, classData, catalogCourse } = facts;
    if (!courseFound)
        fields.push({
            code: "REFERENCE_NOT_FOUND",
            path: ["courseId"],
            message: "A disciplina informada não foi encontrada."
        });
    if (input.studyPeriodId != null && !periodFound)
        fields.push({
            code: "REFERENCE_NOT_FOUND",
            path: ["studyPeriodId"],
            message: "O período letivo informado não foi encontrado."
        });
    if (input.classId != null && !classData)
        fields.push({
            code: "REFERENCE_NOT_FOUND",
            path: ["classId"],
            message: "A turma informada não foi encontrada."
        });
    if (fields.length > 0) return { kind: "reference", fields };

    if (input.status === "APPROVED_BY_PROFICIENCY" && input.classId != null)
        return {
            kind: "invalid",
            fields: [
                invalidField(
                    ["classId"],
                    "Uma disciplina aprovada por proficiência não pode estar vinculada a uma turma."
                )
            ]
        };

    if (!classData) {
        if (!input.evaluationMode)
            return {
                kind: "invalid",
                fields: [
                    requiredField(
                        ["evaluationMode"],
                        "Uma tentativa sem turma exige a modalidade de avaliação."
                    )
                ]
            };
        const evaluationFields = evaluationIssues(input, input.evaluationMode);
        return evaluationFields.length > 0
            ? { kind: "invalid", fields: evaluationFields }
            : {
                  kind: "valid",
                  evaluationMode: input.evaluationMode,
                  studyPeriodId: input.studyPeriodId ?? null
              };
    }

    const invalid: ValidationIssue[] = [];
    if (classData.courseId !== input.courseId)
        invalid.push(
            invalidField(
                ["classId"],
                "A turma deve pertencer à disciplina informada."
            )
        );
    if (
        input.studyPeriodId != null &&
        classData.studyPeriod.id !== input.studyPeriodId
    )
        invalid.push(
            invalidField(
                ["studyPeriodId"],
                "O período informado deve ser o período da turma."
            )
        );
    if (!catalogCourse?.evaluation)
        invalid.push(
            invalidField(
                ["classId"],
                "A turma não possui modalidade de avaliação cadastrada no catálogo do seu ano."
            )
        );
    if (invalid.length > 0) return { kind: "invalid", fields: invalid };
    const evaluationMode = catalogCourse!.evaluation!;
    if (input.evaluationMode && input.evaluationMode !== evaluationMode)
        invalid.push(
            invalidField(
                ["evaluationMode"],
                "A modalidade de uma tentativa com turma é definida pelo catálogo da turma."
            )
        );
    invalid.push(...evaluationIssues(input, evaluationMode));
    return invalid.length > 0
        ? { kind: "invalid", fields: invalid }
        : { kind: "valid", evaluationMode, studyPeriodId: null };
}
export function validateAttemptFacts(
    input: AttemptFactsInput,
    facts: Parameters<typeof resolveAttempt>[1]
) {
    const resolved = resolveAttempt(input, facts);
    return resolved.kind === "valid" ? ok(resolved) : err(resolved);
}
export function isAttemptApprovedForPrerequisite(
    status: AttemptStatus
): boolean {
    return [
        "APPROVED",
        "APPROVED_BY_ATTENDANCE",
        "APPROVED_BY_PROFICIENCY",
        "SUFFICIENT"
    ].includes(status);
}
