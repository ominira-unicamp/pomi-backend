import { NotFoundError } from "@pomi/api-core";
import type { MyPrisma } from "@pomi/db";
import { roleInclude } from "./GroupRole.presenter.js";
export async function loadRole(
    prisma: Pick<MyPrisma.TransactionClient, "groupRole">,
    id: number
) {
    const value = await prisma.groupRole.findUnique({
        where: { id },
        include: roleInclude
    });
    if (!value) throw new NotFoundError("Role não encontrada.");
    return value;
}
