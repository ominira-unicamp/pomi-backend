import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import z, { ZodType } from "zod";
extendZodWithOpenApi(z);
type ValidationErrorField = {
	path: PropertyKey[],
	message: string
}
type ValidationErrorType = {
	message: string,
	errors: ValidationErrorField[]
}
function ZodErrorResponse(error: z.ZodError | undefined, pathPrefix: string[] = []): ValidationErrorField[] {
	if (!error) {
		return [];
	}
	return error.issues.map((err) => ({
		path: [...pathPrefix, ...err.path],
		message: err.message
	}));
}
const ValidationErrorFieldSchema = z.object({
	message: z.string(),
	path: z.array(z.string()),
});
const ValidationErrorSchema = z.object({
	message: z.string(),
	errors: z.array(ValidationErrorFieldSchema)
}).openapi("ValidationError");

class ValidationError implements ValidationErrorType {
	constructor(public errors: ValidationErrorField[] = [], public message: string = "Validation error") {
	}
	addError(path: PropertyKey[], message: string) {
		this.errors.push({ path, message });
	}
	addErrors(newErrors: ValidationErrorField[]) {
		this.errors.push(...newErrors);
	}

}

export {
	ZodErrorResponse,
	ValidationErrorSchema,
	ValidationError,
}
export type {
	ValidationErrorField,
	ValidationErrorType
}