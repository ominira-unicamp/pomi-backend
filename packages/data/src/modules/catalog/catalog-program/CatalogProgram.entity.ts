import IO from "#/modules/catalog/catalog-program/CatalogProgram.contract.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { InconsistentResourceStateError } from "@pomi/api-core";
import { CourseBlockType, MyPrisma } from "@pomi/db";
import z from "zod";

extendZodWithOpenApi(z);

export const prismaBlockSetSelection = {
    include: {
        courseRequirements: {
            include: {
                course: {
                    select: {
                        id: true,
                        code: true,
                        name: true,
                        catalogCourses: {
                            select: { id: true, catalogId: true }
                        }
                    }
                }
            }
        }
    }
} as const satisfies MyPrisma.CourseBlockDefaultArgs;

export const prismaCatalogProgramFieldSelection = {
    include: {
        catalog: {
            select: {
                id: true,
                year: true
            }
        },
        program: {
            select: {
                id: true,
                code: true,
                name: true
            }
        },
        variants: {
            include: {
                curriculumSuggestion: { select: { id: true } },
                program: {
                    select: {
                        id: true,
                        code: true,
                        name: true
                    }
                },
                specialization: {
                    select: {
                        id: true,
                        code: true,
                        name: true
                    }
                },
                courseBlocks: prismaBlockSetSelection
            }
        },
        catalogLanguages: {
            include: {
                language: {
                    select: {
                        id: true,
                        name: true
                    }
                },
                courseBlocks: prismaBlockSetSelection
            }
        },
        courseBlocks: prismaBlockSetSelection
    }
} as const satisfies MyPrisma.CatalogProgramDefaultArgs;

type PrismaCatalogProgramPayload = MyPrisma.CatalogProgramGetPayload<
    typeof prismaCatalogProgramFieldSelection
>;

type PersistedCourseRequirement =
    PrismaCatalogProgramPayload["courseBlocks"][number]["courseRequirements"][number];

function transformCourseRequirement(
    requirement: PersistedCourseRequirement,
    catalogId: number
): z.infer<typeof IO.schemas.courseRequirementSchema> {
    const invalid = (reason: string): never => {
        throw new InconsistentResourceStateError(
            "CourseRequirement",
            requirement.id,
            reason
        );
    };

    if (requirement.type === "any") {
        if (requirement.courseId !== null || requirement.prefix !== null)
            invalid("any_with_variant_data");
        return { id: requirement.id, type: "any" };
    }

    if (requirement.type === "prefix") {
        const prefix = requirement.prefix;
        if (requirement.courseId !== null || !prefix?.trim())
            return invalid("invalid_prefix_variant");
        return {
            id: requirement.id,
            type: "prefix",
            prefix: { value: prefix }
        };
    }

    const courseId = requirement.courseId;
    const course = requirement.course;
    if (
        requirement.type !== "specific" ||
        courseId === null ||
        course === null ||
        requirement.prefix !== null
    )
        return invalid("invalid_specific_variant");

    const catalogCourse = course.catalogCourses.find(
        (item) => item.catalogId === catalogId
    );
    return {
        id: requirement.id,
        type: "specific",
        specific: {
            courseId,
            courseCode: course.code,
            courseName: course.name,
            catalogCourseId: catalogCourse?.id ?? null
        }
    };
}

function transformCourseBlocks(
    courseBlocks: PrismaCatalogProgramPayload["courseBlocks"],
    catalogId: number
): z.infer<typeof IO.schemas.courseBlockSetSchema> {
    const mandatory: z.infer<typeof IO.schemas.courseRequirementSchema>[] = [];
    const electives: z.infer<typeof IO.schemas.electiveBlockSchema>[] = [];

    const mandatoryBlocks = courseBlocks.filter(
        (block) => block.type === CourseBlockType.mandatory
    );
    const electiveBlocks = courseBlocks.filter(
        (block) => block.type === CourseBlockType.elective
    );

    for (const block of mandatoryBlocks) {
        for (const req of block.courseRequirements) {
            mandatory.push(transformCourseRequirement(req, catalogId));
        }
    }

    for (const block of electiveBlocks) {
        const courses = block.courseRequirements.map((requirement) =>
            transformCourseRequirement(requirement, catalogId)
        );

        electives.push({
            credits: block.credits ?? 0,
            courses
        });
    }

    return { mandatory, electives };
}

function transformCatalogProgramVariant(
    variant: PrismaCatalogProgramPayload["variants"][number],
    catalogId: number
): z.infer<typeof IO.schemas.catalogProgramVariantSchema> {
    if (variant.programId !== null && variant.specializationId === null) {
        if (!variant.program || variant.specialization)
            throw new InconsistentResourceStateError(
                "CatalogProgramVariant",
                variant.id,
                "program_variant_has_invalid_relations"
            );
        return {
            id: variant.id,
            curriculumSuggestionId: variant.curriculumSuggestion?.id ?? null,
            code: String(variant.program.code),
            name: variant.program.name,
            integralizationCredits: variant.integralizationCredits,
            integralizationSupervisedHours:
                variant.integralizationSupervisedHours,
            integralizationExtensionHours:
                variant.integralizationExtensionHours,
            integralizationSemesters: variant.integralizationSemesters,
            integralizationMaximumSemesters:
                variant.integralizationMaximumSemesters,
            professionalDescription: variant.professionalDescription,
            recognitionDescription: variant.recognitionDescription,
            blocks: transformCourseBlocks(variant.courseBlocks, catalogId),
            type: "PROGRAM",
            program: { programId: variant.programId }
        };
    }
    if (variant.programId === null && variant.specializationId !== null) {
        if (!variant.specialization || variant.program)
            throw new InconsistentResourceStateError(
                "CatalogProgramVariant",
                variant.id,
                "specialization_variant_has_invalid_relations"
            );
        return {
            id: variant.id,
            curriculumSuggestionId: variant.curriculumSuggestion?.id ?? null,
            code: variant.specialization.code,
            name: variant.specialization.name,
            integralizationCredits: variant.integralizationCredits,
            integralizationSupervisedHours:
                variant.integralizationSupervisedHours,
            integralizationExtensionHours:
                variant.integralizationExtensionHours,
            integralizationSemesters: variant.integralizationSemesters,
            integralizationMaximumSemesters:
                variant.integralizationMaximumSemesters,
            professionalDescription: variant.professionalDescription,
            recognitionDescription: variant.recognitionDescription,
            blocks: transformCourseBlocks(variant.courseBlocks, catalogId),
            type: "SPECIALIZATION",
            specialization: { specializationId: variant.specializationId }
        };
    }
    throw new InconsistentResourceStateError(
        "CatalogProgramVariant",
        variant.id,
        "variant_relation_is_not_exclusive"
    );
}

function buildCatalogProgramEntity(
    catalogProgram: PrismaCatalogProgramPayload
): z.infer<typeof IO.schemas.catalogProgramEntity> {
    const {
        variants: persistedVariants,
        catalogLanguages,
        courseBlocks,
        ...rest
    } = catalogProgram;

    const base = transformCourseBlocks(courseBlocks, catalogProgram.catalog.id);

    const variants = persistedVariants.map((variant) =>
        transformCatalogProgramVariant(variant, catalogProgram.catalog.id)
    );

    const languages = catalogLanguages.map((lang) => ({
        languageId: lang.languageId,
        name: lang.language.name,
        blocks: transformCourseBlocks(
            lang.courseBlocks,
            catalogProgram.catalog.id
        )
    }));

    return {
        ...rest,
        title: catalogProgram.program.name,
        catalogYear: catalogProgram.catalog.year,
        programCode: catalogProgram.program.code,
        programName: catalogProgram.program.name,
        base,
        variants,
        languages
    };
}

export default {
    build: buildCatalogProgramEntity,
    prismaSelection: prismaCatalogProgramFieldSelection
};
