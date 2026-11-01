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
import { personSelection } from "../SocialPerson.queries.js";
import IO, {
    studentPeoplePagination,
    studentPeopleSort
} from "./SocialPeople.contract.js";

type NotFoundProblem = ReturnType<typeof socialNotFoundProblem>;
type Person = z.infer<typeof person>;
type PeopleQuery = z.infer<typeof IO.listPeople.request>["query"];
export type SocialPeopleService = {
    listPeople(
        studentId: number,
        input: PeopleQuery
    ): Promise<{
        items: Person[];
        total: number;
        pagination: ResolvedPagination;
    }>;
    getPerson(
        studentId: number,
        publicId: string
    ): Promise<Result<Person, NotFoundProblem>>;
};

export function createSocialPeopleService({
    prisma
}: {
    prisma: PrismaClient;
}): SocialPeopleService {
    return {
        async listPeople(studentId, input) {
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
                id: { not: studentId },
                publicProfileEnabled: true,
                authUsers: { some: { status: "ACTIVE" as const } },
                ...(input.query === undefined
                    ? {}
                    : z.string().uuid().safeParse(input.query).success
                      ? { OR: [{ publicId: input.query }, visibleName] }
                      : visibleName)
            };
            const [students, total] = await Promise.all([
                prisma.student.findMany({
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
                prisma.student.count({ where })
            ]);
            const acceptedFriendIds = new Set<number>();
            if (
                students.some(
                    (student) => student.currentCoursesVisibility === "FRIENDS"
                )
            ) {
                const friendships = await prisma.studentFriendship.findMany({
                    where: {
                        status: "ACCEPTED",
                        OR: [
                            { studentAId: studentId },
                            { studentBId: studentId }
                        ]
                    },
                    select: { studentAId: true, studentBId: true }
                });
                for (const friendship of friendships)
                    acceptedFriendIds.add(
                        friendship.studentAId === studentId
                            ? friendship.studentBId
                            : friendship.studentAId
                    );
            }
            return {
                items: students.map((student) =>
                    buildPerson(
                        student,
                        decidePersonDisclosure({
                            profileEnabled: student.publicProfileEnabled,
                            forceMinimal: false,
                            isOwner: student.id === studentId,
                            currentCoursesVisibility:
                                student.currentCoursesVisibility,
                            acceptedFriend: acceptedFriendIds.has(student.id)
                        })
                    )
                ),
                total,
                pagination
            };
        },
        async getPerson(studentId, publicId) {
            const student = await prisma.student.findFirst({
                where: {
                    publicId,
                    id: { not: studentId },
                    publicProfileEnabled: true,
                    authUsers: { some: { status: "ACTIVE" } }
                },
                select: personSelection
            });
            if (!student)
                return err(
                    socialNotFoundProblem(
                        "O perfil público solicitado não foi encontrado."
                    )
                );
            const acceptedFriendIds = new Set<number>();
            if (student.currentCoursesVisibility === "FRIENDS") {
                const friendship = await prisma.studentFriendship.findFirst({
                    where: {
                        status: "ACCEPTED",
                        OR: [
                            { studentAId: studentId, studentBId: student.id },
                            { studentAId: student.id, studentBId: studentId }
                        ]
                    },
                    select: { id: true }
                });
                if (friendship) acceptedFriendIds.add(student.id);
            }
            return ok(
                buildPerson(
                    student,
                    decidePersonDisclosure({
                        profileEnabled: student.publicProfileEnabled,
                        forceMinimal: false,
                        isOwner: student.id === studentId,
                        currentCoursesVisibility:
                            student.currentCoursesVisibility,
                        acceptedFriend: acceptedFriendIds.has(student.id)
                    })
                )
            );
        }
    };
}
