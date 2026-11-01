import { planningRule, type PlanningIssue } from "../Planning.rules.js";

export function validateSavedGuide(found: boolean) {
    return planningRule(
        found
            ? []
            : [
                  {
                      path: ["guide", "curriculum", "saved", "curriculumId"],
                      code: "REFERENCE_NOT_FOUND",
                      message:
                          "O currículo salvo não pertence a este estudante."
                  }
              ]
    );
}
export function validateSuggestionGuide(
    expectedProgramId: number,
    actualProgramId: number | null
) {
    const fields: PlanningIssue[] = [];
    if (actualProgramId === null)
        fields.push({
            path: ["guide", "curriculum", "suggestion", "suggestionId"],
            code: "REFERENCE_NOT_FOUND",
            message: "A sugestão curricular não foi encontrada."
        });
    else if (actualProgramId !== expectedProgramId)
        fields.push({
            path: ["guide", "curriculum", "suggestion", "catalogProgramId"],
            code: "INVALID_VALUE",
            message: "A sugestão não pertence ao programa de catálogo."
        });
    return planningRule(fields);
}
export function validateProgramGuide(facts: {
    program: boolean;
    variant: boolean;
    language: boolean;
}) {
    const fields: PlanningIssue[] = [];
    if (!facts.program)
        fields.push({
            path: ["guide", "program", "catalogProgramId"],
            code: "REFERENCE_NOT_FOUND",
            message: "O programa de catálogo não foi encontrado."
        });
    if (!facts.variant)
        fields.push({
            path: ["guide", "program", "catalogProgramVariantId"],
            code: "REFERENCE_NOT_FOUND",
            message: "A variante não está disponível para o programa."
        });
    if (!facts.language)
        fields.push({
            path: ["guide", "program", "languageId"],
            code: "REFERENCE_NOT_FOUND",
            message: "A língua não está disponível para o programa."
        });
    return planningRule(fields);
}
export function resolvePeriodPlanClasses(
    existing: readonly number[],
    operations: {
        set?: ReadonlySet<number>;
        add?: ReadonlySet<number>;
        remove?: ReadonlySet<number>;
    }
) {
    return operations.set
        ? new Set(operations.set)
        : new Set([
              ...existing.filter((id) => !operations.remove?.has(id)),
              ...(operations.add ?? [])
          ]);
}

export function validatePeriodPlanClasses(
    classIds: ReadonlySet<number>,
    classes: readonly { id: number; courseId: number; studyPeriodId: number }[],
    studyPeriodId: number,
    path: string[]
) {
    const byId = new Map(classes.map((item) => [item.id, item]));
    const fields: PlanningIssue[] = [];
    for (const id of classIds) {
        const classEntity = byId.get(id);
        if (!classEntity)
            fields.push({
                code: "REFERENCE_NOT_FOUND",
                path: [...path, String(id)],
                message: `A turma ${id} não foi encontrada.`
            });
        else if (classEntity.studyPeriodId !== studyPeriodId)
            fields.push({
                code: "INVALID_VALUE",
                path: [...path, String(id)],
                message: `A turma ${id} pertence a outro período letivo.`
            });
    }
    const firstClassByCourse = new Map<number, number>();
    for (const classEntity of classes) {
        const firstId = firstClassByCourse.get(classEntity.courseId);
        if (firstId === undefined)
            firstClassByCourse.set(classEntity.courseId, classEntity.id);
        else
            fields.push({
                code: "INVALID_VALUE",
                path: [...path, String(classEntity.id)],
                message: `As turmas ${firstId} e ${classEntity.id} são da mesma disciplina.`
            });
    }
    return planningRule(fields);
}
