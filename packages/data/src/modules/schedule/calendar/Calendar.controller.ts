import { createDataEndpointRegistries, type Context } from "#/BuildHandler.js";
import contract from "#/modules/schedule/calendar/Calendar.contract.js";
import { serializeCalendarFeed } from "#/modules/schedule/calendar/CalendarFeed.js";
import {
    ApiResponse,
    ResponseEffects,
    type EndpointActions
} from "@pomi/api-core";

type Actions = EndpointActions<typeof contract, unknown, Context>;
const get: Actions["get"] = async (context, input) => {
    const events = await context.calendarService.feed(input.query);
    const feed = serializeCalendarFeed(events);
    return ApiResponse.ok(feed, [
        ResponseEffects.setHeader(
            "Content-Type",
            "text/calendar; charset=utf-8"
        ),
        ResponseEffects.setHeader(
            "Content-Disposition",
            'inline; filename="pomi-calendar.ics"'
        ),
        ResponseEffects.setHeader("Cache-Control", "public, max-age=300")
    ]);
};

const { router, registry, authRegistry } = createDataEndpointRegistries(
    contract,
    { get }
);

export default {
    contracts: contract,
    router,
    registry,
    authRegistry
};
