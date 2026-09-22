import {
    curriculumSuggestionDataSchema,
    curriculumSuggestionSort,
    type CurriculumSuggestionFilter,
    type CurriculumSuggestionFilterName,
    type ListCurriculumSuggestionsQuery
} from "#/modules/catalog/curriculum-suggestion/CurriculumSuggestion.contract.js";
import curriculumSuggestionEntity from "#/modules/catalog/curriculum-suggestion/CurriculumSuggestion.entity.js";
import { curriculumSuggestionNotFoundProblem } from "#/modules/catalog/curriculum-suggestion/CurriculumSuggestion.problems.js";
import {
    compareBySort,
    compileFilterWhere,
    err,
    ok,
    prismaWhereFor,
    resolveSort,
    type FilterWhereBuilder,
    type Result
} from "@pomi/api-core";
import type { MyPrisma, PrismaClient } from "@pomi/db";
import z from "zod";

type CurriculumSuggestionData = z.infer<typeof curriculumSuggestionDataSchema>;

const curriculumSuggestionWhere =
    prismaWhereFor<MyPrisma.CurriculumSuggestionWhereInput>();
const curriculumSuggestionWhereDefinitions = {
    catalogProgramId: curriculumSuggestionWhere.numberAt(
        "catalogProgramVariant.catalogProgramId"
    ),
    catalogProgramVariantId: curriculumSuggestionWhere.numberAt(
        "catalogProgramVariantId"
    ),
    catalogId: curriculumSuggestionWhere.numberAt(
        "catalogProgramVariant.catalogProgram.catalogId"
    ),
    catalogYear: curriculumSuggestionWhere.numberAt(
        "catalogProgramVariant.catalogProgram.catalog.year"
    ),
    programId: curriculumSuggestionWhere.numberAt(
        "catalogProgramVariant.catalogProgram.programId"
    ),
    programCode: curriculumSuggestionWhere.numberAt(
        "catalogProgramVariant.catalogProgram.program.code"
    ),
    specializationId: curriculumSuggestionWhere.numberAt(
        "catalogProgramVariant.specializationId"
    )
} satisfies Record<
    CurriculumSuggestionFilterName,
    FilterWhereBuilder<MyPrisma.CurriculumSuggestionWhereInput>
>;

export function curriculumSuggestionFilterWhere(
    filter: CurriculumSuggestionFilter | undefined
): MyPrisma.CurriculumSuggestionWhereInput[] {
    return compileFilterWhere(
        filter,
        curriculumSuggestionWhereDefinitions,
        "curriculum suggestion"
    );
}

export type CurriculumSuggestionService = {
    list(
        input: ListCurriculumSuggestionsQuery
    ): Promise<CurriculumSuggestionData[]>;
    getById(
        id: number
    ): Promise<
        Result<
            CurriculumSuggestionData,
            ReturnType<typeof curriculumSuggestionNotFoundProblem>
        >
    >;
};

export function createCurriculumSuggestionService({
    prisma
}: {
    prisma: PrismaClient;
}): CurriculumSuggestionService {
    return {
        async list(input) {
            const filterWhere = curriculumSuggestionFilterWhere(input.filter);
            const suggestions = await prisma.curriculumSuggestion.findMany({
                ...curriculumSuggestionEntity.prismaSelection,
                where: filterWhere.length > 0 ? { AND: filterWhere } : {}
            });
            return suggestions.map(curriculumSuggestionEntity.build).sort(
                compareBySort(
                    resolveSort(input.sort, curriculumSuggestionSort),
                    {
                        catalogYear: (left, right) =>
                            left.catalogYear - right.catalogYear,
                        programCode: (left, right) =>
                            left.programCode - right.programCode,
                        programName: (left, right) =>
                            left.programName.localeCompare(right.programName),
                        specializationCode: (left, right) =>
                            (left.specialization?.code ?? "").localeCompare(
                                right.specialization?.code ?? ""
                            ),
                        id: (left, right) => left.id - right.id
                    }
                )
            );
        },
        async getById(id) {
            const suggestion = await prisma.curriculumSuggestion.findUnique({
                ...curriculumSuggestionEntity.prismaSelection,
                where: { id }
            });
            return suggestion
                ? ok(curriculumSuggestionEntity.build(suggestion))
                : err(curriculumSuggestionNotFoundProblem());
        }
    };
}
