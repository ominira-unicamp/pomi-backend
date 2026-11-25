import type {
    ExchangePlaceFilter,
    ExchangePlaceFilterName
} from "#/modules/exchange/exchange-place/ExchangePlace.contract.js";
import IO, {
    exchangePlaceSort
} from "#/modules/exchange/exchange-place/ExchangePlace.contract.js";
import {
    compileFilterWhere,
    compileSort,
    prismaPaginationParams,
    prismaWhereFor,
    resolvePagination,
    resolveSort,
    unpaginatedByDefault,
    type FilterWhereBuilder,
    type PageResult
} from "@pomi/api-core";
import type { MyPrisma, PrismaClient } from "@pomi/db";
import z from "zod";

type ExchangePlace = z.infer<typeof IO.schema>;
type Query = z.infer<typeof IO.list.request>["query"];
const exchangePlaceWhere = prismaWhereFor<MyPrisma.ExchangePlaceWhereInput>();
const exchangePlaceWhereDefinitions = {
    id: exchangePlaceWhere.numberAt("id"),
    name: exchangePlaceWhere.containsAt("name")
} satisfies Record<
    ExchangePlaceFilterName,
    FilterWhereBuilder<MyPrisma.ExchangePlaceWhereInput>
>;
export function exchangePlaceFilterWhere(
    filter: ExchangePlaceFilter | undefined
): MyPrisma.ExchangePlaceWhereInput[] {
    return compileFilterWhere(
        filter,
        exchangePlaceWhereDefinitions,
        "exchange place"
    );
}

export type ExchangePlaceService = {
    list(query: Query): Promise<PageResult<ExchangePlace>>;
};

export function createExchangePlaceService({
    prisma
}: {
    prisma: PrismaClient;
}): ExchangePlaceService {
    return {
        async list(query) {
            const filterWhere = exchangePlaceFilterWhere(query.filter);
            const pagination = resolvePagination(query, unpaginatedByDefault);
            const where: MyPrisma.ExchangePlaceWhereInput =
                filterWhere.length > 0 ? { AND: filterWhere } : {};
            const total = await prisma.exchangePlace.count({ where });
            const places = await prisma.exchangePlace.findMany({
                ...prismaPaginationParams(pagination),
                where,
                orderBy: compileSort(
                    resolveSort(query.sort, exchangePlaceSort),
                    {
                        name: (direction) => ({ name: direction }),
                        id: (direction) => ({ id: direction })
                    }
                )
            });
            return {
                items: places.map((place) => ({
                    id: place.id,
                    name: place.name
                })),
                total,
                pagination
            };
        }
    };
}
