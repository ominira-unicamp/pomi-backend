import { createDataEndpointRegistries, type Context } from "#/BuildHandler.js";
import IO from "#/modules/exchange/exchange-place/ExchangePlace.contract.js";
import {
    ApiResponse,
    buildArrayPaginationResponse,
    unpaginatedByDefault,
    type EndpointActions
} from "@pomi/api-core";

const { schema: _schema, ...contracts } = IO;
type Actions = EndpointActions<typeof contracts, unknown, Context>;
const actions: Actions = {
    list: async (ctx, input) =>
        ApiResponse.ok(
            buildArrayPaginationResponse(
                await ctx.exchangePlaceService.list(input.query),
                input.query,
                unpaginatedByDefault,
                "/exchange-places"
            )
        )
};
const { router, registry, authRegistry } = createDataEndpointRegistries(
    contracts,
    actions
);

export default { contracts, router, registry, authRegistry };
