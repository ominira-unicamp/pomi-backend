import type IO from "#/modules/academic/evaluation/professor/ProfessorEvaluation.contract.js";
import type { ProfessorEvaluation } from "@pomi/db";
import type z from "zod";

export function buildProfessorEvaluation(
    evaluation: ProfessorEvaluation
): z.infer<typeof IO.schema> {
    return {
        id: evaluation.id,
        studentId: evaluation.studentId,
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
