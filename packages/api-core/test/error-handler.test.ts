import assert from "node:assert/strict";
import test from "node:test";

import type { Request, Response } from "express";
import type { Logger } from "pino";

import { InconsistentResourceStateError } from "../src/errors/AppError.js";
import errorHandler from "../src/middleware/errorHandler.js";

test("logs the cause and request context for inconsistent resource state", () => {
    let errorAttributes: Record<string, unknown> | undefined;
    const logger = {
        error(attributes: Record<string, unknown>) {
            errorAttributes = attributes;
        }
    } as unknown as Logger;
    const response = {
        locals: { pomiLogger: logger },
        status(statusCode: number) {
            response.statusCode = statusCode;
            return response;
        },
        type() {
            return response;
        },
        json(body: unknown) {
            response.body = body;
            return response;
        },
        statusCode: 200,
        body: undefined as unknown
    } as unknown as Response & {
        body: unknown;
        statusCode: number;
    };

    errorHandler(
        new InconsistentResourceStateError(
            "PeriodPlanning",
            42,
            "invalid_program_variant"
        ),
        {
            method: "GET",
            path: "/student/1/period-plannings",
            route: { path: "/student/:sid/period-plannings" }
        } as unknown as Request,
        response,
        () => undefined
    );

    assert.equal(errorAttributes?.event, "resource.inconsistent_state");
    assert.equal(errorAttributes?.method, "GET");
    assert.equal(errorAttributes?.path, "/student/1/period-plannings");
    assert.equal(errorAttributes?.route, "/student/:sid/period-plannings");
    assert.equal(errorAttributes?.statusCode, 500);
    assert.equal(
        errorAttributes?.problemType,
        "urn:pomi:problem:inconsistent-resource-state"
    );
    assert.equal(errorAttributes?.resource, "PeriodPlanning");
    assert.equal(errorAttributes?.resourceId, 42);
    assert.equal(errorAttributes?.reason, "invalid_program_variant");
    assert.equal(errorAttributes?.err instanceof Error, true);
    assert.equal(response.statusCode, 500);
});
