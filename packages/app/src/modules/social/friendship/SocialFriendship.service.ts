import type { Clock } from "#/application/Clock.js";
import {
    observeOperation,
    type OperationTelemetry
} from "#/application/OperationTelemetry.js";
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
import { activeLegacyIdentity } from "../SocialPerson.queries.js";
import type { AcceptFriendshipFailure } from "./AcceptFriendship.use-case.js";
import { acceptFriendship } from "./AcceptFriendship.use-case.js";
import IO, { studentFriendshipSort } from "./SocialFriendship.contract.js";
import { buildFriendship } from "./SocialFriendship.presenter.js";
import { friendshipSelection } from "./SocialFriendship.queries.js";

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
    userId: number
): MyPrisma.StudentFriendshipWhereInput {
    const direction = String(expression.values[0]);
    return {
        AND: [
            { status: "PENDING" },
            direction === "INCOMING"
                ? { requestedByUserId: { not: userId } }
                : { requestedByUserId: userId }
        ]
    };
}

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
        userId: number,
        input: FriendshipQuery
    ): Promise<Friendship[]>;
    createFriendship(
        userId: number,
        targetPublicId: string
    ): Promise<Result<Friendship, NotFoundProblem | ConflictProblem>>;
    acceptFriendship(
        userId: number,
        id: number
    ): Promise<Result<Friendship, AcceptFriendshipFailure>>;
    removeFriendship(
        userId: number,
        id: number
    ): Promise<Result<void, NotFoundProblem>>;
};

export function createSocialFriendshipService({
    prisma,
    clock,
    operationTelemetry
}: {
    prisma: PrismaClient;
    clock: Clock;
    operationTelemetry?: OperationTelemetry;
}): SocialFriendshipService {
    return {
        async listFriendships(userId, input) {
            const filter = input.filter ?? [];
            const filterWhere = compileFilterWhere(
                filter.filter(
                    (expression) => expression.path.join(".") !== "direction"
                ),
                friendshipFilterWhere,
                "user friendships"
            );
            const directionFilters = filter
                .filter(
                    (expression) => expression.path.join(".") === "direction"
                )
                .map((expression) => directionWhere(expression, userId));
            const rows = await prisma.studentFriendship.findMany({
                where: {
                    AND: [
                        {
                            OR: [{ userAId: userId }, { userBId: userId }]
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
            return rows.map((row) => buildFriendship(row, userId));
        },
        async createFriendship(userId, targetPublicId) {
            const target = await prisma.user.findFirst({
                where: {
                    publicId: targetPublicId,
                    publicProfileEnabled: true,
                    ...activeLegacyIdentity
                },
                select: { id: true }
            });
            if (!target)
                return err(
                    socialNotFoundProblem(
                        "O perfil público solicitado não foi encontrado."
                    )
                );
            if (target.id === userId)
                return err(
                    socialConflictProblem(
                        "Não é possível enviar uma solicitação de amizade para si mesmo."
                    )
                );
            const userAId = Math.min(userId, target.id);
            const userBId = Math.max(userId, target.id);
            try {
                const row = await prisma.studentFriendship.create({
                    data: { userAId, userBId, requestedByUserId: userId },
                    ...friendshipSelection
                });
                return ok(buildFriendship(row, userId));
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
        acceptFriendship(userId, id) {
            return observeOperation(
                "social.friendship.accept",
                () =>
                    acceptFriendship(
                        { prisma, clock },
                        { userId, friendshipId: id }
                    ),
                operationTelemetry
            );
        },
        async removeFriendship(userId, id) {
            const removed = await prisma.studentFriendship.deleteMany({
                where: {
                    id,
                    OR: [{ userAId: userId }, { userBId: userId }]
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
