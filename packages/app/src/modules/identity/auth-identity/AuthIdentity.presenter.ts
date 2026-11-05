import type IO from "#/modules/identity/auth-identity/AuthIdentity.contract.js";
import type z from "zod";
import { type AuthIdentityPayload } from "./AuthIdentity.queries.js";

function build(
    authIdentity: AuthIdentityPayload
): z.infer<typeof IO.schemas.entity> {
    return {
        id: authIdentity.id,
        principalId: authIdentity.principalId,
        userId: authIdentity.principal.user?.id ?? null,
        serviceAccountId: authIdentity.principal.serviceAccount?.id ?? null,
        issuer: authIdentity.issuer,
        subject: authIdentity.subject,
        email: authIdentity.email,
        displayName: authIdentity.displayName,
        status: authIdentity.status,
        roles: authIdentity.roles.map(({ role }) => ({
            authIdentityId: authIdentity.id,
            role
        })),
        capabilities: authIdentity.capabilities.map(({ capability }) => ({
            authIdentityId: authIdentity.id,
            capability
        }))
    };
}

export default {
    build
};
