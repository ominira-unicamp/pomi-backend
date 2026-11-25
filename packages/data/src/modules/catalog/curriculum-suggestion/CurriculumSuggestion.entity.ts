import { curriculumSuggestionDataSchema } from "#/modules/catalog/curriculum-suggestion/CurriculumSuggestion.contract.js";
import { MyPrisma } from "@pomi/db";
import z from "zod";

export const prismaCurriculumSuggestionFieldSelection = {
    include: {
        catalogProgramVariant: {
            include: {
                catalogProgram: {
                    include: {
                        catalog: { select: { year: true } },
                        program: {
                            select: { id: true, code: true, name: true }
                        }
                    }
                },
                specialization: {
                    select: { id: true, code: true, name: true }
                }
            }
        },
        semesters: {
            include: {
                courses: {
                    include: {
                        course: {
                            select: {
                                id: true,
                                code: true,
                                name: true,
                                credits: true
                            }
                        }
                    }
                }
            }
        }
    }
} as const satisfies MyPrisma.CurriculumSuggestionDefaultArgs;

type PrismaCurriculumSuggestionPayload =
    MyPrisma.CurriculumSuggestionGetPayload<
        typeof prismaCurriculumSuggestionFieldSelection
    >;

export function buildCurriculumSuggestionEntity(
    suggestion: PrismaCurriculumSuggestionPayload
): z.infer<typeof curriculumSuggestionDataSchema> {
    return {
        id: suggestion.id,
        catalogProgramVariantId: suggestion.catalogProgramVariantId,
        catalogProgramId: suggestion.catalogProgramVariant.catalogProgramId,
        catalogYear:
            suggestion.catalogProgramVariant.catalogProgram.catalog.year,
        programId: suggestion.catalogProgramVariant.catalogProgram.program.id,
        programCode:
            suggestion.catalogProgramVariant.catalogProgram.program.code,
        programName:
            suggestion.catalogProgramVariant.catalogProgram.program.name,
        specialization: suggestion.catalogProgramVariant.specialization,
        semesters: suggestion.semesters
            .map((semester) => ({
                semester: semester.semester,
                electiveCredits: semester.electiveCredits,
                courses: semester.courses
                    .map(({ course }) => ({
                        id: course.id,
                        code: course.code,
                        name: course.name,
                        credits: course.credits
                    }))
                    .sort((left, right) => left.code.localeCompare(right.code))
            }))
            .sort((left, right) => left.semester - right.semester)
    };
}

export default {
    build: buildCurriculumSuggestionEntity,
    prismaSelection: prismaCurriculumSuggestionFieldSelection
};
