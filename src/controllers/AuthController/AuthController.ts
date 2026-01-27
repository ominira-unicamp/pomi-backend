import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { Router } from "express";
import z from "zod";
import { AuthRegistry, generateToken } from "../../auth.js";
import { buildHandler, Context } from "../../BuildHandler.js";
import IO from "./Interface.js";
import registry from "./OpenAPI.js";

extendZodWithOpenApi(z);

const router = Router();
const authRegistry = new AuthRegistry();

authRegistry.addException("POST", "/login");

async function loginFn(
    _ctx: Context,
    _input: z.infer<typeof IO.login.input>
): Promise<z.infer<typeof IO.login.output>> {
    const token = await generateToken({ userId: 1 });
    return { 200: { accessToken: token } };
}

router.post("/login", buildHandler(IO.login.input, IO.login.output, loginFn));

export default {
    router,
    registry,
    authRegistry,
    paths: {
        login: () => "/login"
    },
    login: loginFn
};
