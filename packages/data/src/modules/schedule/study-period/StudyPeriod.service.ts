import type {
    StudyPeriodFilter,
    StudyPeriodFilterName
} from "#/modules/schedule/study-period/StudyPeriod.contract.js";
import IO, {
    studyPeriodSort
} from "#/modules/schedule/study-period/StudyPeriod.contract.js";
import studyPeriodEntity from "#/modules/schedule/study-period/StudyPeriod.entity.js";
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
type StudyPeriod = z.infer<typeof IO.schema>;
type Query = z.infer<typeof IO.list.request>["query"];
const studyPeriodWhere = prismaWhereFor<MyPrisma.StudyPeriodWhereInput>();
const studyPeriodWhereDefinitions = {
    id: studyPeriodWhere.numberAt("id"),
    year: studyPeriodWhere.numberAt("year"),
    yearPeriod: studyPeriodWhere.enumAt("yearPeriod")
} satisfies Record<
    StudyPeriodFilterName,
    FilterWhereBuilder<MyPrisma.StudyPeriodWhereInput>
>;
export function studyPeriodFilterWhere(
    filter: StudyPeriodFilter | undefined
): MyPrisma.StudyPeriodWhereInput[] {
    return compileFilterWhere(
        filter,
        studyPeriodWhereDefinitions,
        "study period"
    );
}
export type StudyPeriodService = {
    list(query: Query): Promise<PageResult<StudyPeriod>>;
    getById(
        id: number
    ): Promise<
        Result<StudyPeriod, ReturnType<typeof ResourceNotFoundProblem.create>>
    >;
};
export function createStudyPeriodService({
    prisma
}: {
    prisma: PrismaClient;
}): StudyPeriodService {
    return {
        async list(query) {
            const filterWhere = studyPeriodFilterWhere(query.filter);
            const pagination = resolvePagination(query, unpaginatedByDefault);
            const where: MyPrisma.StudyPeriodWhereInput =
                filterWhere.length > 0 ? { AND: filterWhere } : {};
            const total = await prisma.studyPeriod.count({ where });
            return {
                items: (
                    await prisma.studyPeriod.findMany({
                        ...prismaPaginationParams(pagination),
                        where,
                        orderBy: compileSort(
                            resolveSort(query.sort, studyPeriodSort),
                            {
                                id: (direction) => ({ id: direction }),
                                year: (direction) => ({ year: direction }),
                                yearPeriod: (direction) => ({
                                    yearPeriod: direction
                                }),
                                startDate: (direction) => ({
                                    startDate: direction
                                })
                            }
                        )
                    })
                ).map(studyPeriodEntity.build),
                total,
                pagination
            };
        },
        async getById(id) {
            const value = await prisma.studyPeriod.findUnique({
                where: { id }
            });
            return value
                ? ok(studyPeriodEntity.build(value))
                : err(
                      ResourceNotFoundProblem.create({
                          detail: "Study period not found"
                      })
                  );
        }
    };
}
