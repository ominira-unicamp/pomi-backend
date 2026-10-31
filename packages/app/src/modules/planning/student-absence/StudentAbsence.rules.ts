import { err, ok } from "@pomi/api-core";
import type { PlanningIssue } from "../rules/PlanningRule.js";
const dayOfWeekByDateDay = [
    "SUNDAY",
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY"
] as const;
function dateDayOfWeek(date: string) {
    return dayOfWeekByDateDay[new Date(`${date}T00:00:00.000Z`).getUTCDay()];
}
export function validateAbsenceFacts(
    input: { date: string },
    attempt: { classId: number | null } | null,
    schedule: { classId: number; dayOfWeek: string } | null
) {
    const referenceFields = [] as PlanningIssue[];
    if (!attempt)
        referenceFields.push({
            code: "REFERENCE_NOT_FOUND",
            path: ["courseAttemptId"],
            message: "A tentativa de disciplina informada não foi encontrada."
        });
    if (!schedule)
        referenceFields.push({
            code: "REFERENCE_NOT_FOUND",
            path: ["classScheduleId"],
            message: "O horário de turma informado não foi encontrado."
        });
    if (referenceFields.length > 0)
        return err({ kind: "reference" as const, fields: referenceFields });

    const invalidFields = [] as PlanningIssue[];
    if (attempt!.classId === null)
        invalidFields.push({
            code: "REQUIRED",
            path: ["courseAttemptId"],
            message: "Uma falta exige que a tentativa tenha uma turma."
        });
    if (attempt!.classId !== schedule!.classId)
        invalidFields.push({
            code: "INVALID_VALUE",
            path: ["classScheduleId"],
            message: "O horário deve pertencer à turma da tentativa."
        });
    if (dateDayOfWeek(input.date) !== schedule!.dayOfWeek)
        invalidFields.push({
            code: "INVALID_VALUE",
            path: ["date"],
            message: "A data deve corresponder ao dia da semana do horário."
        });
    if (invalidFields.length > 0)
        return err({ kind: "invalid" as const, fields: invalidFields });

    return ok(undefined);
}
