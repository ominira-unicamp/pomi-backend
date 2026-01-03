import z from "zod";
import type { Request, Response } from "express";
import { ValidationError, ZodToApiError } from "./Validation";

export type InputSchemaTypes<PT extends z.ZodType, Q extends z.ZodType, B extends z.ZodType> = z.ZodObject<{
	path?: PT,
	query?: Q,
	body?: B
}>


type outputsType = z.ZodObject<{
	[key: number]: z.ZodType
}>;


export function buildHandler<PT extends z.ZodType, Q extends z.ZodType, B extends z.ZodType, I extends InputSchemaTypes<PT, Q, B>, O extends outputsType>(inputSchema : I, outputSchema : O,  fn: (input: z.infer<I>) => Promise<z.infer<O>>) {
	return async function handler(req: Request, res: Response) {
		const { data: input, error, success } = inputSchema.safeParse({
			query: req.query,
			path: req.params,
			body: req.body
		});
		if (!success)
			return res.status(400).json(new ValidationError(ZodToApiError(error, [])));
		const output = await fn(input);
		const status = Object.keys(outputSchema.shape).map(k => parseInt(k)).find(statusCode => {
			if (Object.hasOwn(outputSchema.shape, statusCode)) {
				return true;
			}
		})
		if (status == undefined) {
			throw new Error("No status code defined in output schema");
		}		
		return res.json(output[status] );
	}
}