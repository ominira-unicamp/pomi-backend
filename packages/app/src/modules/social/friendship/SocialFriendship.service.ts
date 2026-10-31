import {
    compileFilterWhere,
    compileSort,
    err,
    ok,
    prismaWhereFor,
    resolveSort,
    type FilterExpression,
    type FilterWhereBuilder,
    type Result
} from "@pomi/api-core";
import type { MyPrisma, PrismaClient } from "@pomi/db";
import type z from "zod";
import {
    socialConflictProblem,
    socialNotFoundProblem
} from "../Social.problems.js";
import type { friendship } from "../Social.schemas.js";
import { personSelection } from "../SocialPerson.queries.js";
import IO, { studentFriendshipSort } from "./SocialFriendship.contract.js";
import { buildFriendship } from "./SocialFriendship.presenter.js";

type NotFoundProblem = ReturnType<typeof socialNotFoundProblem>;
type Friendship = z.infer<typeof friendship>;
type FriendshipQuery = z.infer<typeof IO.listFriendships.request>["query"];
type ConflictProblem = ReturnType<typeof socialConflictProblem>;
const friendshipWhere = prismaWhereFor<MyPrisma.StudentFriendshipWhereInput>();
const friendshipFilterWhere = {
    status: friendshipWhere.enumAt("status")
} satisfies Record<
    string,
    FilterWhereBuilder<MyPrisma.StudentFriendshipWhereInput>
>;

function directionWhere(
    expression: FilterExpression,
    studentId: number
): MyPrisma.StudentFriendshipWhereInput {
    const direction = String(expression.values[0]);
    return {
        AND: [
            { status: "PENDING" },
            direction === "INCOMING"
                ? { requestedById: { not: studentId } }
                : { requestedById: studentId }
        ]
    };
}

const friendshipSelection = {
    include: {
        studentA: { select: personSelection },
        studentB: { select: personSelection }
    }
} as const;

function isUniqueViolation(error: unknown) {
    return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
    );
}

export type SocialFriendshipService = {
    listFriendships(
        studentId: number,
        input: FriendshipQuery
    ): Promise<Friendship[]>;
    createFriendship(
        studentId: number,
        targetPublicId: string
    ): Promise<Result<Friendship, NotFoundProblem | ConflictProblem>>;
    acceptFriendship(
        studentId: number,
        id: number
    ): Promise<Result<Friendship, NotFoundProblem | ConflictProblem>>;
    removeFriendship(
        studentId: number,
        id: number
    ): Promise<Result<void, NotFoundProblem>>;
};

export function createSocialFriendshipService({
    prisma
}: {
    prisma: PrismaClient;
}): SocialFriendshipService {
    const findFriendship = (id: number) =>
        prisma.studentFriendship.findUnique({
            where: { id },
            ...friendshipSelection
        });
    return {
        async listFriendships(studentId, input) {
            const filter = input.filter ?? [];
            const filterWhere = compileFilterWhere(
                filter.filter(
                    (expression) => expression.path.join(".") !== "direction"
                ),
                friendshipFilterWhere,
                "student friendships"
            );
            const directionFilters = filter
                .filter(
                    (expression) => expression.path.join(".") === "direction"
                )
                .map((expression) => directionWhere(expression, studentId));
            const rows = await prisma.studentFriendship.findMany({
                where: {
                    AND: [
                        {
                            OR: [
                                { studentAId: studentId },
                                { studentBId: studentId }
                            ]
                        },
                        ...filterWhere,
                        ...directionFilters
                    ]
                },
                ...friendshipSelection,
                orderBy: compileSort(
                    resolveSort(input.sort, studentFriendshipSort),
                    {
                        updatedAt: (direction) => ({ updatedAt: direction }),
                        status: (direction) => ({ status: direction }),
                        id: (direction) => ({ id: direction })
                    }
                )
            });
            return rows.map((row) => buildFriendship(row, studentId));
        },
        async createFriendship(studentId, targetPublicId) {
            const target = await prisma.student.findFirst({
                where: {
                    publicId: targetPublicId,
                    publicProfileEnabled: true,
                    authUsers: { some: { status: "ACTIVE" } }
                },
                select: { id: true }
            });
            if (!target)
                return err(
                    socialNotFoundProblem(
                        "O perfil público solicitado não foi encontrado."
                    )
                );
            if (target.id === studentId)
                return err(
                    socialConflictProblem(
                        "Não é possível enviar uma solicitação de amizade para si mesmo."
                    )
                );
            const studentAId = Math.min(studentId, target.id);
            const studentBId = Math.max(studentId, target.id);
            try {
                const row = await prisma.studentFriendship.create({
                    data: { studentAId, studentBId, requestedById: studentId },
                    ...friendshipSelection
                });
                return ok(buildFriendship(row, studentId));
            } catch (error) {
                if (isUniqueViolation(error))
                    return err(
                        socialConflictProblem(
                            "Já existe uma amizade ou solicitação entre estes alunos."
                        )
                    );
                throw error;
            }
        },
        async acceptFriendship(studentId, id) {
            const existing = await prisma.studentFriendship.findFirst({
                where: {
                    id,
                    OR: [{ studentAId: studentId }, { studentBId: studentId }]
                },
                select: { status: true, requestedById: true }
            });
            if (!existing)
                return err(
                    socialNotFoundProblem("A solicitação não foi encontrada.")
                );
            if (
                existing.status !== "PENDING" ||
                existing.requestedById === studentId
            )
                return err(
                    socialConflictProblem(
                        "A solicitação não pode ser aceita por este aluno."
                    )
                );
            const updated = await prisma.studentFriendship.updateMany({
                where: {
                    id,
                    status: "PENDING",
                    requestedById: { not: studentId },
                    OR: [{ studentAId: studentId }, { studentBId: studentId }]
                },
                data: { status: "ACCEPTED", acceptedAt: new Date() }
            });
            if (!updated.count)
                return err(
                    socialConflictProblem(
                        "A solicitação já foi alterada e não pode mais ser aceita."
                    )
                );
            const row = await findFriendship(id);
            return row
                ? ok(buildFriendship(row, studentId))
                : err(
                      socialNotFoundProblem("A solicitação não foi encontrada.")
                  );
        },
        async removeFriendship(studentId, id) {
            const removed = await prisma.studentFriendship.deleteMany({
                where: {
                    id,
                    OR: [{ studentAId: studentId }, { studentBId: studentId }]
                }
            });
            return removed.count
                ? ok(undefined)
                : err(
                      socialNotFoundProblem(
                          "A amizade ou solicitação não foi encontrada."
                      )
                  );
        }
    };
}
