import IO from "#/modules/schedule/calendar-tag/CalendarTag.contract.js";
import { MyPrisma } from "@pomi/db";
import z from "zod";

type PrismaCalendarTagPayload = MyPrisma.CalendarTagGetPayload<{
    select: {
        id: true;
        name: true;
    };
}>;

function buildCalendarTagEntity(
    calendarTag: PrismaCalendarTagPayload
): z.infer<typeof IO.schema> {
    return calendarTag;
}

export default {
    build: buildCalendarTagEntity
};
