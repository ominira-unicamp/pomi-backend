import { NotFoundError } from "@pomi/api-core";
import type { MyPrisma } from "@pomi/db";
import { eventInclude } from "./GroupEvent.presenter.js";
export async function loadEvent(
    prisma: Pick<MyPrisma.TransactionClient, "groupEvent">,
    id: number
) {
    const value = await prisma.groupEvent.findUnique({
        where: { id },
        include: eventInclude
    });
    if (!value) throw new NotFoundError("Evento não encontrado.");
    return value;
}
