import { NotFoundError } from "@pomi/api-core";
import type { DatabaseClient } from "@pomi/db";

export type LegacyStudentContext = {
    resolveLegacyUser(studentId: number): Promise<number>;
};

export function createLegacyUserResolver(prisma: Pick<DatabaseClient, "user">) {
    const resolved = new Map<number, Promise<number>>();
    return (studentId: number) => {
        let userId = resolved.get(studentId);
        if (!userId) {
            userId = prisma.user
                .findUnique({ where: { studentId }, select: { id: true } })
                .then((user) => {
                    if (!user)
                        throw new NotFoundError(
                            "O estudante solicitado não foi encontrado."
                        );
                    return user.id;
                });
            resolved.set(studentId, userId);
        }
        return userId;
    };
}

export function requireLegacyStudentId(user: {
    studentId: number | null;
    legacyStudentId: number | null;
}) {
    const id = user.legacyStudentId ?? user.studentId;
    if (id === null)
        throw new Error(
            "Legacy student representation is unavailable for a user without an academic alias."
        );
    return id;
}
