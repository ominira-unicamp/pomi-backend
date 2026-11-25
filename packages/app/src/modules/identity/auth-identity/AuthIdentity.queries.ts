import type { MyPrisma } from "@pomi/db";

export const prismaAuthIdentitySelection = {
    include: {
        principal: {
            select: {
                user: { select: { id: true } },
                serviceAccount: { select: { id: true } }
            }
        },
        roles: true,
        capabilities: true
    }
} as const satisfies MyPrisma.AuthIdentityDefaultArgs;

export type AuthIdentityPayload = MyPrisma.AuthIdentityGetPayload<
    typeof prismaAuthIdentitySelection
>;
