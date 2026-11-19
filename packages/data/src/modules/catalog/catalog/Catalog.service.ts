import type {
    CatalogFilter,
    CatalogFilterName
} from "#/modules/catalog/catalog/Catalog.contract.js";
import IO, { catalogSort } from "#/modules/catalog/catalog/Catalog.contract.js";
import catalogEntity from "#/modules/catalog/catalog/Catalog.entity.js";
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
type Catalog = z.infer<typeof IO.schemas.catalogEntitySchema>;
type Query = z.infer<typeof IO.list.request>["query"];

const catalogWhere = prismaWhereFor<MyPrisma.CatalogWhereInput>();
const catalogWhereDefinitions = {
    year: catalogWhere.numberAt("year")
} satisfies Record<
    CatalogFilterName,
    FilterWhereBuilder<MyPrisma.CatalogWhereInput>
>;

export function catalogFilterWhere(
    filter: CatalogFilter | undefined
): MyPrisma.CatalogWhereInput[] {
    return compileFilterWhere(filter, catalogWhereDefinitions, "catalog");
}
export type CatalogService = {
    list(query: Query): Promise<PageResult<Catalog>>;
    getById(
        id: number
    ): Promise<
        Result<Catalog, ReturnType<typeof ResourceNotFoundProblem.create>>
    >;
};
export function createCatalogService({
    prisma
}: {
    prisma: PrismaClient;
}): CatalogService {
    return {
        async list(query) {
            const filterWhere = catalogFilterWhere(query.filter);
            const pagination = resolvePagination(query, unpaginatedByDefault);
            const where: MyPrisma.CatalogWhereInput =
                filterWhere.length > 0 ? { AND: filterWhere } : {};
            const total = await prisma.catalog.count({ where });
            return {
                items: (
                    await prisma.catalog.findMany({
                        ...prismaPaginationParams(pagination),
                        ...catalogEntity.prismaSelection,
                        where,
                        orderBy: compileSort(
                            resolveSort(query.sort, catalogSort),
                            {
                                year: (direction) => ({ year: direction }),
                                id: (direction) => ({ id: direction })
                            }
                        )
                    })
                ).map(catalogEntity.build),
                total,
                pagination
            };
        },
        async getById(id) {
            const catalog = await prisma.catalog.findUnique({
                ...catalogEntity.prismaSelection,
                where: { id }
            });
            return catalog
                ? ok(catalogEntity.build(catalog))
                : err(
                      ResourceNotFoundProblem.create({
                          detail: "Catalog not found"
                      })
                  );
        }
    };
}
