import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import type { Request, Response } from "express";
import { Router } from "express";

import { openApiFromEndpoint } from "../openapi/EndpointOpenApi.js";
import { pathSegmentToExpressPath } from "../PathSegment.js";
import {
    assertQueryFeatureConsistency,
    assertSdkMetadataConsistency,
    type EndpointContract,
    type EndpointRegistry
} from "./EndpointContract.js";
import { buildEndpointHandler, type EndpointAction } from "./RequestHandler.js";

export type EndpointActions<
    Contracts extends EndpointRegistry<Authorization>,
    Authorization,
    Context
> = {
    [Key in keyof Contracts]: EndpointAction<Contracts[Key], Context>;
};

export function createEndpointRegistries<
    Authorization,
    Context,
    Contracts extends EndpointRegistry<Authorization>
>(options: {
    contracts: Contracts;
    actions: EndpointActions<Contracts, Authorization, Context>;
    createContext(request: Request, response: Response): Context;
    registerAuthorization(
        method: Uppercase<EndpointContract<Authorization>["meta"]["method"]>,
        path: string,
        authorization: Authorization
    ): void;
    authorizationSecurity?(
        authorization: Authorization
    ): Array<Record<string, string[]>>;
}) {
    const router = Router();
    const openApiRegistry = new OpenAPIRegistry();
    const sdkOperations = new Set<string>();

    for (const [name, contract] of Object.entries(options.contracts)) {
        assertQueryFeatureConsistency(contract);
        assertSdkMetadataConsistency(contract);
        if (contract.meta.sdk) {
            const sdkOperation = `${contract.meta.sdk.resource}.${contract.meta.sdk.method ?? contract.meta.sdk.action}`;
            if (sdkOperations.has(sdkOperation)) {
                throw new Error(`Duplicate SDK operation ${sdkOperation}`);
            }
            sdkOperations.add(sdkOperation);
        }
        const action = options.actions[name];
        if (!action) throw new Error(`Missing action for endpoint ${name}`);
        const path = pathSegmentToExpressPath(contract.meta.path);
        router[contract.meta.method](
            path,
            buildEndpointHandler(
                contract,
                action as EndpointAction<typeof contract, Context>,
                options.createContext
            )
        );
        const security = options.authorizationSecurity?.(
            contract.meta.authorization
        );
        openApiRegistry.registerPath(
            openApiFromEndpoint(contract, { security })
        );
        options.registerAuthorization(
            contract.meta.method.toUpperCase() as Uppercase<
                typeof contract.meta.method
            >,
            path,
            contract.meta.authorization
        );
    }

    return { router, openApiRegistry };
}
