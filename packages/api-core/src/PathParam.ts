import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import z from "zod";

extendZodWithOpenApi(z);

export const pathParam = {
    integer: () =>
        z
            .string()
            .pipe(z.coerce.number())
            .pipe(z.number().int())
            .openapi({ type: "integer" }),
    positiveInteger: () =>
        z
            .string()
            .pipe(z.coerce.number())
            .pipe(z.number().int().positive())
            .openapi({ type: "integer" })
};
