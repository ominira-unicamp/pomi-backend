import type {
    CalendarEventFilter,
    CalendarEventFilterName
} from "#/modules/schedule/calendar-event/CalendarEvent.contract.js";
import IO, {
    calendarEventSort
} from "#/modules/schedule/calendar-event/CalendarEvent.contract.js";
import calendarEventEntity from "#/modules/schedule/calendar-event/CalendarEvent.entity.js";
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
type Event = z.infer<typeof IO.schema>;
type Query = z.infer<typeof IO.list.request>["query"];

const calendarEventWhere = prismaWhereFor<MyPrisma.CalendarEventWhereInput>();
const calendarEventWhereDefinitions = {
    startDate: (expression) => ({
        OR: [
            {
                endDate: {
                    gte: new Date(String(expression.values[0]))
                }
            },
            { endDate: null }
        ]
    }),
    endDate: (expression) => ({
        startDate: { lte: new Date(String(expression.values[0])) }
    }),
    tagId: calendarEventWhere.numberAt("tags.some.id")
} satisfies Record<
    CalendarEventFilterName,
    FilterWhereBuilder<MyPrisma.CalendarEventWhereInput>
>;

export function calendarEventFilterWhere(
    filter: CalendarEventFilter | undefined
): MyPrisma.CalendarEventWhereInput[] {
    return compileFilterWhere(
        filter,
        calendarEventWhereDefinitions,
        "calendar event"
    );
}
export type CalendarEventService = {
    list(query: Query): Promise<PageResult<Event>>;
    getById(
        id: number
    ): Promise<
        Result<Event, ReturnType<typeof ResourceNotFoundProblem.create>>
    >;
};
export function createCalendarEventService({
    prisma
}: {
    prisma: PrismaClient;
}): CalendarEventService {
    return {
        async list(query) {
            const filterWhere = calendarEventFilterWhere(query.filter);
            const pagination = resolvePagination(query, unpaginatedByDefault);
            const where: MyPrisma.CalendarEventWhereInput =
                filterWhere.length > 0 ? { AND: filterWhere } : {};
            const total = await prisma.calendarEvent.count({ where });
            return {
                items: (
                    await prisma.calendarEvent.findMany({
                        ...prismaPaginationParams(pagination),
                        ...calendarEventEntity.prismaSelection,
                        where,
                        orderBy: compileSort(
                            resolveSort(query.sort, calendarEventSort),
                            {
                                startDate: (direction) => ({
                                    startDate: direction
                                }),
                                endDate: (direction) => ({
                                    endDate: direction
                                }),
                                description: (direction) => ({
                                    description: direction
                                }),
                                id: (direction) => ({ id: direction })
                            }
                        )
                    })
                ).map(calendarEventEntity.build),
                total,
                pagination
            };
        },
        async getById(id) {
            const value = await prisma.calendarEvent.findUnique({
                ...calendarEventEntity.prismaSelection,
                where: { id }
            });
            return value
                ? ok(calendarEventEntity.build(value))
                : err(
                      ResourceNotFoundProblem.create({
                          detail: "Calendar event not found"
                      })
                  );
        }
    };
}
