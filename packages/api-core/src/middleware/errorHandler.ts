import type { NextFunction, Request, Response } from "express";
import {
    AppError,
    InconsistentResourceStateError
} from "../errors/AppError.js";
import {
    appErrorProblem,
    internalServerErrorProblem
} from "../errors/ProblemDetails.js";
import { sendProblem } from "../http/problemResponse.js";
import { requestLogger } from "../telemetry/logger.js";

function errorHandler(
    err: unknown,
    req: Request,
    res: Response,
    _next: NextFunction
) {
    if (err instanceof AppError) {
        if (err.status >= 500) {
            requestLogger(res)?.error(
                {
                    err,
                    event: "resource.inconsistent_state",
                    method: req.method,
                    path: req.path,
                    route:
                        typeof req.route?.path === "string"
                            ? req.route.path
                            : "unmatched",
                    statusCode: err.status,
                    problemType: err.type,
                    ...(err instanceof InconsistentResourceStateError
                        ? {
                              resource: err.resource,
                              resourceId: err.resourceId,
                              reason: err.reason
                          }
                        : {})
                },
                "Estado interno inconsistente durante requisição HTTP"
            );
        }
        sendProblem(res, appErrorProblem(err, req.path));
        return;
    }
    requestLogger(res)?.error(
        {
            err,
            event: "http.request.failed",
            method: req.method,
            path: req.path,
            route:
                typeof req.route?.path === "string"
                    ? req.route.path
                    : "unmatched"
        },
        "Erro não tratado durante requisição HTTP"
    );
    sendProblem(res, internalServerErrorProblem(req.path));
}

export default errorHandler;
