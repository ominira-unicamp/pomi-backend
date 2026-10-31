import { ConflictError, NotFoundError } from "@pomi/api-core";
import type { MyPrisma } from "@pomi/db";
export async function requireTags(
    prisma: Pick<MyPrisma.TransactionClient, "tag">,
    ids: number[]
) {
    if (ids.length !== new Set(ids).size)
        throw new ConflictError("Tag repetida.");
    if ((await prisma.tag.count({ where: { id: { in: ids } } })) !== ids.length)
        throw new NotFoundError("Tag não encontrada.");
}
