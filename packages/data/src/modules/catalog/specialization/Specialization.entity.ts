import IO from "#/modules/catalog/specialization/Specialization.contract.js";
import { MyPrisma } from "@pomi/db";
import z from "zod";

export const prismaSpecializationFieldSelection = {
    include: {
        program: {
            select: {
                id: true,
                code: true,
                name: true
            }
        },
        _count: {
            select: {
                catalogProgramVariants: true,
                students: true
            }
        }
    }
} as const satisfies MyPrisma.SpecializationDefaultArgs;

type PrismaSpecializationPayload = MyPrisma.SpecializationGetPayload<
    typeof prismaSpecializationFieldSelection
>;

function buildSpecializationEntity(
    specialization: PrismaSpecializationPayload
): z.infer<typeof IO.schema> {
    const { _count, program, ...rest } = specialization;
    return {
        ...rest,
        programCode: program.code,
        programName: program.name,
        catalogProgramVariantsCount: _count.catalogProgramVariants,
        studentsCount: _count.students
    };
}

export default {
    build: buildSpecializationEntity,
    prismaSelection: prismaSpecializationFieldSelection
};
