import { ConflictError } from "@pomi/api-core";
import type { MyPrisma, PrismaClient } from "@pomi/db";
export async function serializable<T>(
    prisma: PrismaClient,
    work: (tx: MyPrisma.TransactionClient) => Promise<T>
) {
    try {
        return await prisma.$transaction(work, {
            isolationLevel: "Serializable"
        });
    } catch (error) {
        if ((error as { code?: string }).code === "P2034")
            throw new ConflictError(
                "O grupo mudou durante a operação. Tente novamente."
            );
        throw error;
    }
}
