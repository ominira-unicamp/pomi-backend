import type { Principal } from "#/auth.js";
import { ForbiddenError } from "@pomi/api-core";
import type { PrismaClient } from "@pomi/db";
import type z from "zod";
import type IO from "./CurrentUser.contract.js";

export type CurrentUserService = {
    get(principal: Principal): z.infer<typeof IO.schemas.entity>;
    completeWelcome(
        principal: Principal
    ): Promise<z.infer<typeof IO.schemas.entity>>;
};

export function createCurrentUserService({
    prisma
}: {
    prisma: PrismaClient;
}): CurrentUserService {
    return {
        get(principal) {
            return {
                principalId: principal.principalId,
                authIdentityId: principal.authIdentityId,
                kind: principal.userId !== null ? "HUMAN" : "SERVICE",
                userId: principal.userId,
                serviceAccountId: principal.serviceAccountId,
                roles: [...principal.roles],
                capabilities: [...principal.capabilities],
                studentId: principal.studentId,
                welcomePending: principal.welcomePending === true
            };
        },
        async completeWelcome(principal) {
            if (principal.userId === null)
                throw new ForbiddenError(
                    "Esta operação exige uma conta de usuário."
                );
            await prisma.user.update({
                where: { id: principal.userId },
                data: { welcomePending: false }
            });
            return this.get({ ...principal, welcomePending: false });
        }
    };
}
