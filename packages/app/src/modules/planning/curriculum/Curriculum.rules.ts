import { err, ok } from "@pomi/api-core";
import { planningRule, type PlanningIssue } from "../Planning.rules.js";
export type CurriculumSelection = {
    catalogProgramId?: number | null;
    catalogProgramVariantId?: number | null;
    languageId?: number | null;
};
export type PeriodOperations = {
    update?: { id: number; position: number }[];
    remove?: number[];
    add?: { position: number }[];
};
export function selectionData(selection: CurriculumSelection | undefined) {
    return {
        catalogProgramId: selection?.catalogProgramId ?? null,
        catalogProgramVariantId: selection?.catalogProgramVariantId ?? null,
        languageId: selection?.languageId ?? null
    };
}
export function patchSelectionData(
    selection: CurriculumSelection | undefined,
    existing: {
        catalogProgramId: number | null;
        catalogProgramVariant: { id: number } | null;
        catalogLanguage: { languageId: number } | null;
    }
) {
    const catalogProgramId =
        selection?.catalogProgramId !== undefined
            ? selection.catalogProgramId
            : existing.catalogProgramId;
    const programChanged =
        selection?.catalogProgramId !== undefined &&
        catalogProgramId !== existing.catalogProgramId;
    return selectionData({
        catalogProgramId,
        catalogProgramVariantId: programChanged
            ? null
            : selection?.catalogProgramVariantId !== undefined
              ? selection.catalogProgramVariantId
              : (existing.catalogProgramVariant?.id ?? null),
        languageId: programChanged
            ? null
            : selection?.languageId !== undefined
              ? selection.languageId
              : (existing.catalogLanguage?.languageId ?? null)
    });
}
export function planningStartData(
    planningStart:
        | { year: number; semester: 1 | 2; semesterNumber: number }
        | null
        | undefined
) {
    return planningStart
        ? {
              planningStartYear: planningStart.year,
              planningStartSemester: planningStart.semester,
              planningStartNumber: planningStart.semesterNumber
          }
        : {
              planningStartYear: null,
              planningStartSemester: null,
              planningStartNumber: null
          };
}
export function validateCurriculumSelection(
    selection: ReturnType<typeof selectionData>,
    facts: {
        program: { id: number } | null;
        variant: { catalogProgramId: number } | null;
        language: { catalogProgramId: number } | null;
    }
) {
    const fields: PlanningIssue[] = [];
    const { program, variant, language } = facts;
    if (selection.catalogProgramId !== null && !program)
        fields.push({
            code: "REFERENCE_NOT_FOUND",
            path: ["selection", "catalogProgramId"],
            message: "O programa de catálogo informado não foi encontrado."
        });
    if (
        selection.catalogProgramVariantId !== null &&
        (!variant || variant.catalogProgramId !== selection.catalogProgramId)
    )
        fields.push({
            code: variant ? "INVALID_VALUE" : "REFERENCE_NOT_FOUND",
            path: ["selection", "catalogProgramVariantId"],
            message:
                "A variante não pertence ao programa de catálogo informado."
        });
    if (
        selection.languageId !== null &&
        (!language || language.catalogProgramId !== selection.catalogProgramId)
    )
        fields.push({
            code: language ? "INVALID_VALUE" : "REFERENCE_NOT_FOUND",
            path: ["selection", "languageId"],
            message: "A língua não pertence ao programa de catálogo informado."
        });
    return planningRule(fields);
}
export function planCurriculumPeriodChanges(
    existing: readonly { id: number; position: number }[],
    operations: PeriodOperations
) {
    const ids = new Set(existing.map(({ id }) => id));
    const fields: PlanningIssue[] = [];
    for (const [index, update] of (operations.update ?? []).entries())
        if (!ids.has(update.id))
            fields.push({
                code: "REFERENCE_NOT_FOUND",
                path: ["periods", "update", String(index), "id"],
                message: "O período não pertence ao planejamento."
            });
    for (const [index, id] of (operations.remove ?? []).entries())
        if (!ids.has(id))
            fields.push({
                code: "REFERENCE_NOT_FOUND",
                path: ["periods", "remove", String(index)],
                message: "O período não pertence ao planejamento."
            });
    if (fields.length) return err(fields);

    const removed = new Set(operations.remove ?? []);
    const positions = [
        ...existing
            .filter(({ id }) => !removed.has(id))
            .map(
                ({ id, position }) =>
                    operations.update?.find((item) => item.id === id)
                        ?.position ?? position
            ),
        ...(operations.add ?? []).map(({ position }) => position)
    ];
    if (new Set(positions).size !== positions.length)
        return err([
            {
                code: "INVALID_VALUE",
                path: ["periods"],
                message: "As posições dos períodos devem ser únicas."
            }
        ]);

    return ok({
        removed: [...removed],
        updates: operations.update ?? [],
        additions: operations.add ?? []
    });
}

export function validateCurriculumCoursePeriods(
    periodIds: readonly number[],
    foundCount: number
) {
    return planningRule(
        foundCount === new Set(periodIds).size
            ? []
            : [
                  {
                      code: "REFERENCE_NOT_FOUND",
                      path: ["courses", "upsert"],
                      message:
                          "Todos os períodos devem pertencer ao planejamento."
                  }
              ]
    );
}
