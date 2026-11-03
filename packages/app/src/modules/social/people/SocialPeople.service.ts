import {
    compileSort,
    err,
    ok,
    prismaPaginationParams,
    resolvePagination,
    resolveSort,
    type ResolvedPagination,
    type Result
} from "@pomi/api-core";
import type { PrismaClient } from "@pomi/db";
import z from "zod";
import { socialNotFoundProblem } from "../Social.problems.js";
import type { person } from "../Social.schemas.js";
import {
    buildPerson,
    decidePersonDisclosure
} from "../SocialPerson.presenter.js";
import { activeIdentity, personSelection } from "../SocialPerson.queries.js";
import IO, {
    studentPeoplePagination,
    studentPeopleSort
} from "./SocialPeople.contract.js";

type NotFoundProblem = ReturnType<typeof socialNotFoundProblem>;
type Person = z.infer<typeof person>;
type PeopleQuery = z.infer<typeof IO.listPeople.request>["query"];
export type SocialPeopleService = {
    listPeople(
        userId: number,
        input: PeopleQuery
    ): Promise<{
        items: Person[];
        total: number;
        pagination: ResolvedPagination;
    }>;
    getPerson(
        userId: number,
        publicId: string
    ): Promise<Result<Person, NotFoundProblem>>;
};

export function createSocialPeopleService({
    prisma
}: {
    prisma: PrismaClient;
}): SocialPeopleService {
    return {
        async listPeople(userId, input) {
            const pagination = resolvePagination(
                input,
                studentPeoplePagination
            );
            const visibleName = {
                OR: [
                    {
                        publicDisplayName: {
                            contains: input.query,
                            mode: "insensitive" as const
                        }
                    },
                    {
                        publicDisplayName: null,
                        name: {
                            contains: input.query,
                            mode: "insensitive" as const
                        }
                    }
                ]
            };
            const where = {
                id: { not: userId },
                publicProfileEnabled: true,
                ...activeIdentity,
                ...(input.query === undefined
                    ? {}
                    : z.string().uuid().safeParse(input.query).success
                      ? { OR: [{ publicId: input.query }, visibleName] }
                      : visibleName)
            };
            const [students, total] = await Promise.all([
                prisma.user.findMany({
                    where,
                    select: personSelection,
                    orderBy: compileSort(
                        resolveSort(input.sort, studentPeopleSort),
                        {
                            displayName: (direction) => [
                                { publicDisplayName: direction },
                                { name: direction }
                            ],
                            id: (direction) => ({ id: direction })
                        }
                    ).flat(),
                    ...prismaPaginationParams(pagination)
                }),
                prisma.user.count({ where })
            ]);
            const acceptedFriendIds = new Set<number>();
            if (
                students.some(
                    (user) => user.currentCoursesVisibility === "FRIENDS"
                )
            ) {
                const friendships = await prisma.studentFriendship.findMany({
                    where: {
                        status: "ACCEPTED",
                        OR: [{ userAId: userId }, { userBId: userId }]
                    },
                    select: { userAId: true, userBId: true }
                });
                for (const friendship of friendships)
                    acceptedFriendIds.add(
                        friendship.userAId === userId
                            ? friendship.userBId
                            : friendship.userAId
                    );
            }
            return {
                items: students.map((user) =>
                    buildPerson(
                        user,
                        decidePersonDisclosure({
                            profileEnabled: user.publicProfileEnabled,
                            forceMinimal: false,
                            isOwner: user.id === userId,
                            currentCoursesVisibility:
                                user.currentCoursesVisibility,
                            acceptedFriend: acceptedFriendIds.has(user.id)
                        })
                    )
                ),
                total,
                pagination
            };
        },
        async getPerson(userId, publicId) {
            const user = await prisma.user.findFirst({
                where: {
                    publicId,
                    id: { not: userId },
                    publicProfileEnabled: true,
                    ...activeIdentity
                },
                select: personSelection
            });
            if (!user)
                return err(
                    socialNotFoundProblem(
                        "O perfil público solicitado não foi encontrado."
                    )
                );
            const acceptedFriendIds = new Set<number>();
            if (user.currentCoursesVisibility === "FRIENDS") {
                const friendship = await prisma.studentFriendship.findFirst({
                    where: {
                        status: "ACCEPTED",
                        OR: [
                            { userAId: userId, userBId: user.id },
                            { userAId: user.id, userBId: userId }
                        ]
                    },
                    select: { id: true }
                });
                if (friendship) acceptedFriendIds.add(user.id);
            }
            return ok(
                buildPerson(
                    user,
                    decidePersonDisclosure({
                        profileEnabled: user.publicProfileEnabled,
                        forceMinimal: false,
                        isOwner: user.id === userId,
                        currentCoursesVisibility: user.currentCoursesVisibility,
                        acceptedFriend: acceptedFriendIds.has(user.id)
                    })
                )
            );
        }
    };
}
