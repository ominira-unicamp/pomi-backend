import { NotFoundError } from "@pomi/api-core";
import type { DatabaseClient } from "@pomi/db";

export type UserContext = {
    resolveUserContext(userId: number, academic?: boolean): Promise<number>;
};

export function createUserResolver(prisma: Pick<DatabaseClient, "user">) {
    const resolved = new Map<number, Promise<number>>();
    return async (userId: number, academic = false) => {
        if (academic) {
            const owner = await prisma.user.findUnique({
                where: { id: userId },
                select: { studentId: true }
            });
            if (owner?.studentId == null)
                throw new NotFoundError(
                    "O usuário não possui vínculo acadêmico."
                );
        }
        let value = resolved.get(userId);
        if (!value) {
            value = prisma.user
                .findUnique({ where: { id: userId }, select: { id: true } })
                .then((user) => {
                    if (!user)
                        throw new NotFoundError(
                            "O usuário solicitado não foi encontrado."
                        );
                    return user.id;
                });
            resolved.set(userId, value);
        }
        return value;
    };
}

export function canonicalUserId(user: { id: number }) {
    return user.id;
}
