import type {
    ProgramFilter,
    ProgramFilterName
} from "#/modules/catalog/program/Program.contract.js";
import IO, { programSort } from "#/modules/catalog/program/Program.contract.js";
import programEntity from "#/modules/catalog/program/Program.entity.js";
import {
    compileFilterWhere,
    compileSort,
    err,
    ok,
    prismaPaginationParams,
    prismaWhereFor,
    resolvePagination,
    resolveSort,
    ResourceNotFoundProblem,
    unpaginatedByDefault,
    type FilterWhereBuilder,
    type PageResult,
    type Result
} from "@pomi/api-core";
import type { MyPrisma, PrismaClient } from "@pomi/db";
import z from "zod";
type Program = z.infer<typeof IO.schema>;
type Query = z.infer<typeof IO.list.request>["query"];

const programWhere = prismaWhereFor<MyPrisma.ProgramWhereInput>();
const programWhereDefinitions = {
    unitId: programWhere.numberAt("unitId")
} satisfies Record<
    ProgramFilterName,
    FilterWhereBuilder<MyPrisma.ProgramWhereInput>
>;

export function programFilterWhere(
    filter: ProgramFilter | undefined
): MyPrisma.ProgramWhereInput[] {
    return compileFilterWhere(filter, programWhereDefinitions, "program");
}
export type ProgramService = {
    list(query: Query): Promise<PageResult<Program>>;
    getById(
        id: number
    ): Promise<
        Result<Program, ReturnType<typeof ResourceNotFoundProblem.create>>
    >;
};
export function createProgramService({
    prisma
}: {
    prisma: PrismaClient;
}): ProgramService {
    return {
        async list(query) {
            const filterWhere = programFilterWhere(query.filter);
            const pagination = resolvePagination(query, unpaginatedByDefault);
            const where: MyPrisma.ProgramWhereInput =
                filterWhere.length > 0 ? { AND: filterWhere } : {};
            const total = await prisma.program.count({ where });
            return {
                items: (
                    await prisma.program.findMany({
                        ...prismaPaginationParams(pagination),
                        ...programEntity.prismaSelection,
                        where,
                        orderBy: compileSort(
                            resolveSort(query.sort, programSort),
                            {
                                code: (direction) => ({ code: direction }),
                                name: (direction) => ({ name: direction }),
                                unitCode: (direction) => ({
                                    unit: { code: direction }
                                }),
                                id: (direction) => ({ id: direction })
                            }
                        )
                    })
                ).map(programEntity.build),
                total,
                pagination
            };
        },
        async getById(id) {
            const program = await prisma.program.findUnique({
                ...programEntity.prismaSelection,
                where: { id }
            });
            return program
                ? ok(programEntity.build(program))
                : err(
                      ResourceNotFoundProblem.create({
                          detail: "Program not found"
                      })
                  );
        }
    };
}
