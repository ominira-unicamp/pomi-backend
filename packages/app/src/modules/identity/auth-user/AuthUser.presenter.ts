import type IO from "#/modules/identity/auth-user/AuthUser.contract.js";
import type z from "zod";
import { type AuthUserPayload } from "./AuthUser.queries.js";

function build(authUser: AuthUserPayload): z.infer<typeof IO.schemas.entity> {
    return {
        id: authUser.legacyId,
        issuer: authUser.issuer,
        subject: authUser.subject,
        email: authUser.email,
        displayName: authUser.displayName,
        status: authUser.status,
        roles: authUser.roles.map(({ role }) => ({
            authUserId: authUser.legacyId,
            role
        })),
        capabilities: authUser.capabilities.map(({ capability }) => ({
            authUserId: authUser.legacyId,
            capability
        }))
    };
}

export default {
    build
};
