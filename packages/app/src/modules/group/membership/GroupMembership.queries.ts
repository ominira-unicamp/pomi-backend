import { NotFoundError } from "@pomi/api-core";
import type { MyPrisma } from "@pomi/db";
import { membershipInclude } from "./GroupMembership.presenter.js";
export async function loadMember(
    prisma: Pick<MyPrisma.TransactionClient, "groupMembership">,
    id: number
) {
    const value = await prisma.groupMembership.findUnique({
        where: { id },
        include: membershipInclude
    });
    if (!value) throw new NotFoundError("Vínculo não encontrado.");
    return value;
}
