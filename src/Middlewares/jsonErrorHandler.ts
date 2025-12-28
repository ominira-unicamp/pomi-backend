import type { ErrorRequestHandler, NextFunction, Request, Response } from "express";
import { ValidationError } from "../Validation";

const jsonErrorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (err instanceof SyntaxError && 'status' in err && err.status === 400 && 'body' in err) {
    console.error('Invalid JSON body:', err.message);
    return res.status(400).json(new ValidationError(
      [{ path: ["body"], message: "Malformed JSON body" }]
    ));
  }
  next(err);
}
export default jsonErrorHandler;