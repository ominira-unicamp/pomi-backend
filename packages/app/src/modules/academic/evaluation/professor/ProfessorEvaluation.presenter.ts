import type IO from "#/modules/academic/evaluation/professor/ProfessorEvaluation.contract.js";
import { requireLegacyStudentId } from "#/modules/identity/LegacyStudentContext.js";
import type { ProfessorEvaluation } from "@pomi/db";
import type z from "zod";

export function buildProfessorEvaluation(
    evaluation: ProfessorEvaluation & {
        user: { studentId: number | null; legacyStudentId: number | null };
    }
): z.infer<typeof IO.schema> {
    return {
        id: evaluation.id,
        studentId: requireLegacyStudentId(evaluation.user),
        classId: evaluation.classId,
        professorId: evaluation.professorId,
        wouldTakeAgain: evaluation.wouldTakeAgain,
        fairness: evaluation.fairness,
        clarity: evaluation.clarity,
        difficulty: evaluation.difficulty,
        createdAt: evaluation.createdAt.toISOString(),
        updatedAt: evaluation.updatedAt.toISOString()
    };
}
