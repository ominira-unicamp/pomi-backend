import { createDataEndpointRegistries, type Context } from "#/BuildHandler.js";
import IO from "#/modules/exchange/exchange-place/ExchangePlace.contract.js";
import {
    ApiResponse,
    buildQueryPaginationResponse,
    type EndpointActions
} from "@pomi/api-core";

const { schema: _schema, ...contracts } = IO;
type Actions = EndpointActions<typeof contracts, unknown, Context>;
const actions: Actions = {
    list: async (ctx, input) =>
        ApiResponse.ok(
            buildQueryPaginationResponse(
                await ctx.exchangePlaceService.list(input.query),
                input.query,
                "/exchange-places"
            )
        )
};
const { router, registry, authRegistry } = createDataEndpointRegistries(
    contracts,
    actions
);

export default { contracts, router, registry, authRegistry };
