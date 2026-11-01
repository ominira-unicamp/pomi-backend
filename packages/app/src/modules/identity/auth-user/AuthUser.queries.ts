import type { MyPrisma } from "@pomi/db";

export const prismaAuthUserSelection = {
    include: {
        roles: true,
        capabilities: true
    }
} as const satisfies MyPrisma.AuthUserDefaultArgs;

export type AuthUserPayload = MyPrisma.AuthUserGetPayload<
    typeof prismaAuthUserSelection
>;
