import type {
    RoomFilter,
    RoomFilterName
} from "#/modules/academic/room/Room.contract.js";
import IO, { roomSort } from "#/modules/academic/room/Room.contract.js";
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

type Room = z.infer<typeof IO.schema>;
type Query = z.infer<typeof IO.list.request>["query"];
const roomWhere = prismaWhereFor<MyPrisma.RoomWhereInput>();
const roomWhereDefinitions = {
    id: roomWhere.numberAt("id"),
    code: roomWhere.stringAt("code")
} satisfies Record<RoomFilterName, FilterWhereBuilder<MyPrisma.RoomWhereInput>>;
export function roomFilterWhere(
    filter: RoomFilter | undefined
): MyPrisma.RoomWhereInput[] {
    return compileFilterWhere(filter, roomWhereDefinitions, "room");
}

export type RoomService = {
    list(query: Query): Promise<PageResult<Room>>;
    getById(
        id: number
    ): Promise<Result<Room, ReturnType<typeof ResourceNotFoundProblem.create>>>;
};

export function createRoomService({
    prisma
}: {
    prisma: PrismaClient;
}): RoomService {
    return {
        async list(query) {
            const filterWhere = roomFilterWhere(query.filter);
            const pagination = resolvePagination(query, unpaginatedByDefault);
            const where: MyPrisma.RoomWhereInput =
                filterWhere.length > 0 ? { AND: filterWhere } : {};
            const total = await prisma.room.count({ where });
            return {
                items: await prisma.room.findMany({
                    ...prismaPaginationParams(pagination),
                    where,
                    orderBy: compileSort(resolveSort(query.sort, roomSort), {
                        code: (direction) => ({ code: direction }),
                        id: (direction) => ({ id: direction })
                    })
                }),
                total,
                pagination
            };
        },
        async getById(id) {
            const room = await prisma.room.findUnique({ where: { id } });
            return room
                ? ok(room)
                : err(
                      ResourceNotFoundProblem.create({
                          detail: "Room not found"
                      })
                  );
        }
    };
}
