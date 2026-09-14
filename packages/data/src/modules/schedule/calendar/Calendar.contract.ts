import { policies } from "#/auth.js";
import { calendarQuerySchema } from "#/modules/schedule/calendar/CalendarQuery.js";
import { defineEndpoint, pathSeg, request, responses } from "@pomi/api-core";
import z from "zod";

const get = defineEndpoint({
    meta: {
        method: "get",
        path: [pathSeg.literal("calendar")],
        tags: ["calendar"],
        operationId: "getCalendarFeed",
        summary: "Get public iCalendar feed",
        authorization: policies.public,
        queryFeatures: { filter: true },
        sdk: {
            resource: "calendar",
            method: "getFeed",
            action: "get"
        }
    },
    request: request({ query: calendarQuerySchema }),
    response: responses()
        .ok(z.string(), "Public iCalendar feed", {
            mediaType: "text/calendar"
        })
        .build()
});

export default { get };
