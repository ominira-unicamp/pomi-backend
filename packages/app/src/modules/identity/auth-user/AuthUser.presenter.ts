import type IO from "#/modules/identity/auth-user/AuthUser.contract.js";
import type z from "zod";
import { type AuthUserPayload } from "./AuthUser.queries.js";

function build(authUser: AuthUserPayload): z.infer<typeof IO.schemas.entity> {
    return {
        id: authUser.id,
        issuer: authUser.issuer,
        subject: authUser.subject,
        email: authUser.email,
        displayName: authUser.displayName,
        status: authUser.status,
        roles: authUser.roles,
        capabilities: authUser.capabilities
    };
}

export default {
    build
};
