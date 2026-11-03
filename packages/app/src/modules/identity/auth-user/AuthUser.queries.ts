import type { MyPrisma } from "@pomi/db";

export const prismaAuthUserSelection = {
    include: {
        roles: true,
        capabilities: true
    }
} as const satisfies MyPrisma.AuthIdentityDefaultArgs;

export type AuthUserPayload = MyPrisma.AuthIdentityGetPayload<
    typeof prismaAuthUserSelection
>;
