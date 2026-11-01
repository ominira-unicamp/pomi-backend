import type { Principal } from "#/auth.js";
import type z from "zod";
import type IO from "./CurrentUser.contract.js";

export type CurrentUserService = {
    get(principal: Principal): z.infer<typeof IO.schemas.entity>;
};

export function createCurrentUserService(): CurrentUserService {
    return {
        get(principal) {
            return {
                id: principal.authUserId,
                roles: [...principal.roles],
                capabilities: [...principal.capabilities],
                studentId: principal.studentId
            };
        }
    };
}
