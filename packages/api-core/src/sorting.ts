import z from "zod";

export const sortDirections = ["asc", "desc"] as const;

export type SortDirection = (typeof sortDirections)[number];
export type SortTerm<Field extends string = string> = {
    field: Field;
    direction: SortDirection;
};

export type SortDefinition<
    SortableField extends string = string,
    TieBreakerField extends string = string
> = {
    resourceName: string;
    sortableFields: readonly SortableField[];
    defaultSort: readonly SortTerm<SortableField>[];
    tieBreakers: readonly SortTerm<TieBreakerField>[];
};

export type SortDefinitionField<Definition extends SortDefinition> =
    | Definition["sortableFields"][number]
    | Definition["tieBreakers"][number]["field"];

export type PomiSortMetadata = {
    version: 1;
    fields: string[];
    default: string;
};

export function defineSort<
    const SortableField extends string,
    const TieBreakerField extends string
>(definition: SortDefinition<SortableField, TieBreakerField>) {
    const sortableFields = new Set<string>(definition.sortableFields);
    const defaultFields = new Set<string>();
    for (const term of definition.defaultSort) {
        if (!sortableFields.has(term.field)) {
            throw new Error(
                `Default sort field "${term.field}" is not sortable`
            );
        }
        if (defaultFields.has(term.field)) {
            throw new Error(`Duplicate default sort field "${term.field}"`);
        }
        defaultFields.add(term.field);
    }
    if (definition.defaultSort.length === 0) {
        throw new Error("Default sort must contain at least one field");
    }
    const tieBreakerFields = new Set<string>();
    for (const term of definition.tieBreakers) {
        if (tieBreakerFields.has(term.field)) {
            throw new Error(`Duplicate tie-breaker field "${term.field}"`);
        }
        tieBreakerFields.add(term.field);
    }
    return definition;
}

function serializeSortTerms(terms: readonly SortTerm[]) {
    return terms
        .map(({ field, direction }) => `${field}:${direction}`)
        .join(",");
}

export function sortOpenApiMetadata(
    definition: SortDefinition
): PomiSortMetadata {
    return {
        version: 1,
        fields: [...definition.sortableFields],
        default: serializeSortTerms(definition.defaultSort)
    };
}

export function resourceSortSchema<
    const SortableField extends string,
    const TieBreakerField extends string
>(definition: SortDefinition<SortableField, TieBreakerField>) {
    const allowedFields = new Set<string>(definition.sortableFields);
    return z
        .string()
        .min(1)
        .transform((value, context): SortTerm<SortableField>[] => {
            const terms: SortTerm<SortableField>[] = [];
            const seen = new Set<string>();
            for (const [index, rawTerm] of value.split(",").entries()) {
                const parts = rawTerm.split(":");
                const field = parts[0] ?? "";
                const direction = parts[1] ?? "";
                if (
                    parts.length !== 2 ||
                    field.length === 0 ||
                    direction.length === 0 ||
                    rawTerm.trim() !== rawTerm
                ) {
                    context.addIssue({
                        code: "custom",
                        path: [index],
                        message: `A ordenação "${rawTerm}" é inválida. Use campo:asc ou campo:desc.`,
                        params: { code: "SORT_SYNTAX_INVALID" }
                    });
                    continue;
                }
                if (!allowedFields.has(field)) {
                    context.addIssue({
                        code: "custom",
                        path: [index],
                        message: `O campo "${field}" não é ordenável neste endpoint. Campos aceitos: ${definition.sortableFields.join(", ")}.`,
                        params: {
                            code: "SORT_FIELD_UNSUPPORTED",
                            details: {
                                resource: definition.resourceName,
                                field,
                                allowedFields: definition.sortableFields
                            }
                        }
                    });
                    continue;
                }
                if (!sortDirections.includes(direction as SortDirection)) {
                    context.addIssue({
                        code: "custom",
                        path: [index],
                        message: `A direção "${direction}" é inválida para o campo "${field}". Direções aceitas: asc, desc.`,
                        params: {
                            code: "SORT_DIRECTION_UNSUPPORTED",
                            details: { field, direction }
                        }
                    });
                    continue;
                }
                if (seen.has(field)) {
                    context.addIssue({
                        code: "custom",
                        path: [index],
                        message: `O campo "${field}" foi informado mais de uma vez na ordenação.`,
                        params: {
                            code: "SORT_FIELD_DUPLICATE",
                            details: { field }
                        }
                    });
                    continue;
                }
                seen.add(field);
                terms.push({
                    field: field as SortableField,
                    direction: direction as SortDirection
                });
            }
            return context.issues.length > 0 ? z.NEVER : terms;
        })
        .openapi({
            type: "string",
            description:
                "Ordered comma-separated field:direction terms. Earlier terms have higher priority.",
            example: serializeSortTerms(definition.defaultSort),
            param: {
                "style": "form",
                "explode": false,
                "x-pomi-sort": sortOpenApiMetadata(definition)
            }
        });
}

export function resolveSort<
    const SortableField extends string,
    const TieBreakerField extends string
>(
    requested: readonly SortTerm<SortableField>[] | undefined,
    definition: SortDefinition<SortableField, TieBreakerField>
): SortTerm<SortableField | TieBreakerField>[] {
    const primary =
        requested && requested.length > 0 ? requested : definition.defaultSort;
    const fields = new Set<string>(primary.map(({ field }) => field));
    return [
        ...primary,
        ...definition.tieBreakers.filter(({ field }) => !fields.has(field))
    ];
}

export function compileSort<
    Field extends string,
    Compilers extends Record<Field, (direction: SortDirection) => unknown>
>(
    terms: readonly SortTerm<Field>[],
    compilers: Compilers
): ReturnType<Compilers[Field]>[] {
    return terms.map(({ field, direction }) =>
        compilers[field](direction)
    ) as ReturnType<Compilers[Field]>[];
}

export function compareBySort<Item, Field extends string>(
    terms: readonly SortTerm<Field>[],
    comparators: Record<Field, (left: Item, right: Item) => number>
) {
    return (left: Item, right: Item) => {
        for (const { field, direction } of terms) {
            const result = comparators[field](left, right);
            if (result !== 0) return direction === "asc" ? result : -result;
        }
        return 0;
    };
}

export function isSortTerms(value: unknown): value is SortTerm[] {
    return (
        Array.isArray(value) &&
        value.every(
            (item) =>
                typeof item === "object" &&
                item !== null &&
                "field" in item &&
                typeof item.field === "string" &&
                "direction" in item &&
                sortDirections.includes(item.direction as SortDirection)
        )
    );
}

export function serializeSort(terms: readonly SortTerm[]) {
    return serializeSortTerms(terms);
}

export function unsupportedQuerySortField(
    query: unknown,
    queryFeatures?: { sort?: boolean }
) {
    if (
        typeof query !== "object" ||
        query === null ||
        !("sort" in query) ||
        query.sort === undefined ||
        queryFeatures?.sort
    ) {
        return undefined;
    }
    return {
        code: "SORT_UNSUPPORTED_ENDPOINT",
        path: ["query", "sort"],
        message: "Este endpoint não aceita ordenação.",
        details: { feature: "sort" }
    };
}
