import type {
    CoordinatorFilter,
    CoordinatorFilterName
} from "#/modules/catalog/coordinator/Coordinator.contract.js";
import IO, {
    coordinatorSort
} from "#/modules/catalog/coordinator/Coordinator.contract.js";
import coordinatorEntity from "#/modules/catalog/coordinator/Coordinator.entity.js";
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
    type Result
} from "@pomi/api-core";
import type { MyPrisma, PrismaClient } from "@pomi/db";
import z from "zod";

type Coordinator = z.infer<typeof IO.schema>;
type Query = z.infer<typeof IO.list.request>["query"];

const coordinatorWhere = prismaWhereFor<MyPrisma.CoordinatorWhereInput>();
const coordinatorWhereDefinitions = {
    name: coordinatorWhere.containsAt("name")
} satisfies Record<
    CoordinatorFilterName,
    FilterWhereBuilder<MyPrisma.CoordinatorWhereInput>
>;

export function coordinatorFilterWhere(
    filter: CoordinatorFilter | undefined
): MyPrisma.CoordinatorWhereInput[] {
    return compileFilterWhere(
        filter,
        coordinatorWhereDefinitions,
        "coordinator"
    );
}

export type CoordinatorService = {
    list(query: Query): Promise<{
        items: Coordinator[];
        total: number;
        pagination: import("@pomi/api-core").ResolvedPagination;
    }>;
    getById(
        id: number
    ): Promise<
        Result<Coordinator, ReturnType<typeof ResourceNotFoundProblem.create>>
    >;
};

export function createCoordinatorService({
    prisma
}: {
    prisma: PrismaClient;
}): CoordinatorService {
    return {
        async list(query) {
            const pagination = resolvePagination(query, unpaginatedByDefault);
            const filterWhere = coordinatorFilterWhere(query.filter);
            const where: MyPrisma.CoordinatorWhereInput =
                filterWhere.length > 0 ? { AND: filterWhere } : {};
            const total = await prisma.coordinator.count({ where });
            const coordinators = await prisma.coordinator.findMany({
                ...prismaPaginationParams(pagination),
                ...coordinatorEntity.selection,
                where,
                orderBy: compileSort(resolveSort(query.sort, coordinatorSort), {
                    name: (direction) => ({ name: direction }),
                    id: (direction) => ({ id: direction })
                })
            });
            return {
                items: coordinators.map(coordinatorEntity.build),
                total,
                pagination
            };
        },
        async getById(id) {
            const coordinator = await prisma.coordinator.findUnique({
                ...coordinatorEntity.selection,
                where: { id }
            });
            return coordinator
                ? ok(coordinatorEntity.build(coordinator))
                : err(
                      ResourceNotFoundProblem.create({
                          detail: "Coordinator not found"
                      })
                  );
        }
    };
}
