import IO from "#/modules/catalog/program/Program.contract.js";
import { MyPrisma, selectIdCode } from "@pomi/db";
import z from "zod";

export const prismaProgramFieldSelection = {
    include: {
        unit: selectIdCode,
        _count: {
            select: {
                catalogPrograms: true,
                students: true
            }
        }
    }
} as const satisfies MyPrisma.ProgramDefaultArgs;

type PrismaProgramPayload = MyPrisma.ProgramGetPayload<
    typeof prismaProgramFieldSelection
>;

function buildProgramEntity(
    program: PrismaProgramPayload
): z.infer<typeof IO.schema> {
    const { unit, _count, ...rest } = program;
    return {
        ...rest,
        unit,
        catalogProgramsCount: _count.catalogPrograms,
        studentsCount: _count.students
    };
}

export default {
    build: buildProgramEntity,
    prismaSelection: prismaProgramFieldSelection
};
