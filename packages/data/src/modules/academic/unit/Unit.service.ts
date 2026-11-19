import type {
    UnitFilter,
    UnitFilterName
} from "#/modules/academic/unit/Unit.contract.js";
import IO, { unitSort } from "#/modules/academic/unit/Unit.contract.js";
import unitEntity from "#/modules/academic/unit/Unit.entity.js";
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
import type z from "zod";

type Unit = z.infer<typeof IO.schema>;
type Query = z.infer<typeof IO.list.request>["query"];
const unitWhere = prismaWhereFor<MyPrisma.UnitWhereInput>();
const unitWhereDefinitions = {
    id: unitWhere.numberAt("id"),
    code: unitWhere.stringAt("code"),
    name: unitWhere.containsAt("name")
} satisfies Record<UnitFilterName, FilterWhereBuilder<MyPrisma.UnitWhereInput>>;
export function unitFilterWhere(
    filter: UnitFilter | undefined
): MyPrisma.UnitWhereInput[] {
    return compileFilterWhere(filter, unitWhereDefinitions, "unit");
}
export type UnitService = {
    list(query: Query): Promise<PageResult<Unit>>;
    getById(
        id: number
    ): Promise<Result<Unit, ReturnType<typeof ResourceNotFoundProblem.create>>>;
};
export function createUnitService({
    prisma
}: {
    prisma: PrismaClient;
}): UnitService {
    return {
        async list(query) {
            const filterWhere = unitFilterWhere(query.filter);
            const pagination = resolvePagination(query, unpaginatedByDefault);
            const where: MyPrisma.UnitWhereInput =
                filterWhere.length > 0 ? { AND: filterWhere } : {};
            const total = await prisma.unit.count({ where });
            return {
                items: (
                    await prisma.unit.findMany({
                        ...prismaPaginationParams(pagination),
                        where,
                        orderBy: compileSort(
                            resolveSort(query.sort, unitSort),
                            {
                                code: (direction) => ({ code: direction }),
                                name: (direction) => ({ name: direction }),
                                id: (direction) => ({ id: direction })
                            }
                        )
                    })
                ).map(unitEntity.build),
                total,
                pagination
            };
        },
        async getById(id) {
            const unit = await prisma.unit.findUnique({ where: { id } });
            return unit
                ? ok(unitEntity.build(unit))
                : err(
                      ResourceNotFoundProblem.create({
                          detail: "Unit not found"
                      })
                  );
        }
    };
}
