import periodPlanningPresenter from "#/modules/planning/period-plan/PeriodPlan.presenter.js";
import { prismaPeriodPlanningFieldSelection } from "#/modules/planning/period-plan/PeriodPlan.queries.js";
import IO, {
    sharedPeriodPlanningPagination,
    sharedPeriodPlanningSort
} from "#/modules/planning/shared-period-plan/SharedPeriodPlan.contract.js";
import {
    compileFilterWhere,
    compileSort,
    err,
    ok,
    prismaPaginationParams,
    prismaWhereFor,
    resolvePagination,
    resolveSort,
    ResourceNotFoundProblem,
    type FilterWhereBuilder,
    type ResolvedPagination,
    type Result
} from "@pomi/api-core";
import type { MyPrisma, PrismaClient } from "@pomi/db";
import z from "zod";

type SharedPeriodPlan = z.infer<typeof IO.schema>;
type PublicQuery = z.infer<typeof IO.listPublic.request>["query"];
type StudentQuery = z.infer<typeof IO.listForUser.request>["query"];
type NotFound = ReturnType<typeof ResourceNotFoundProblem.create>;

const periodPlanningWhere = prismaWhereFor<MyPrisma.PeriodPlanningWhereInput>();
const publicFilterWhere = {
    studyPeriodId: periodPlanningWhere.numberAt("studyPeriodId")
} satisfies Record<
    string,
    FilterWhereBuilder<MyPrisma.PeriodPlanningWhereInput>
>;
const studentFilterWhere = {
    ownerPublicId: periodPlanningWhere.stringAt("user.publicId")
} satisfies Record<
    string,
    FilterWhereBuilder<MyPrisma.PeriodPlanningWhereInput>
>;

const selection = {
    ...prismaPeriodPlanningFieldSelection,
    include: {
        ...prismaPeriodPlanningFieldSelection.include,
        user: {
            select: {
                id: true,
                studentId: true,
                publicId: true,
                publicProfileEnabled: true,
                publicDisplayName: true,
                avatarMediaId: true
            }
        }
    }
} as const;

type Selected = MyPrisma.PeriodPlanningGetPayload<typeof selection>;

function notFound(): NotFound {
    return ResourceNotFoundProblem.create({
        detail: "O planejamento compartilhado solicitado não foi encontrado."
    });
}

function buildShared(row: NonNullable<Selected>): SharedPeriodPlan {
    if (row.visibility === "PRIVATE")
        throw new Error("A private period plan cannot be shared.");
    const entity = periodPlanningPresenter.build(row);
    return {
        shareId: row.shareId,
        name: row.name,
        visibility: row.visibility,
        studyPeriodId: entity.studyPeriodId,
        studyPeriodYear: entity.studyPeriodYear,
        studyPeriodYearPeriod: entity.studyPeriodYearPeriod,
        owner: row.user.publicProfileEnabled
            ? {
                  publicId: row.user.publicId,
                  displayName: row.user.publicDisplayName ?? "Aluno do POMI",
                  avatarMediaId: row.user.avatarMediaId
              }
            : null,
        classes: entity.classes,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString()
    };
}

function publicWhere(query: PublicQuery): MyPrisma.PeriodPlanningWhereInput {
    const baseWhere: MyPrisma.PeriodPlanningWhereInput = {
        visibility: "PUBLIC" as const,
        ...(query.query
            ? {
                  OR: [
                      {
                          name: {
                              contains: query.query,
                              mode: "insensitive" as const
                          }
                      },
                      {
                          user: {
                              publicProfileEnabled: true,
                              publicDisplayName: {
                                  contains: query.query,
                                  mode: "insensitive" as const
                              }
                          }
                      }
                  ]
              }
            : {})
    };
    const filterWhere = compileFilterWhere(
        query.filter,
        publicFilterWhere,
        "shared period plannings"
    );
    return filterWhere.length
        ? { AND: [baseWhere, ...filterWhere] }
        : baseWhere;
}

export type SharedPeriodPlanService = {
    listPublic(input: PublicQuery): Promise<{
        items: SharedPeriodPlan[];
        total: number;
        pagination: ResolvedPagination;
    }>;
    getPublic(shareId: string): Promise<Result<SharedPeriodPlan, NotFound>>;
    listForUser(
        userId: number,
        input: StudentQuery
    ): Promise<{
        items: SharedPeriodPlan[];
        total: number;
        pagination: ResolvedPagination;
    }>;
    getForUser(
        userId: number,
        shareId: string
    ): Promise<Result<SharedPeriodPlan, NotFound>>;
};

export function createSharedPeriodPlanService({
    prisma
}: {
    prisma: PrismaClient;
}): SharedPeriodPlanService {
    const findFriend = (viewerId: number) => ({
        OR: [
            { userAId: viewerId, status: "ACCEPTED" as const },
            { userBId: viewerId, status: "ACCEPTED" as const }
        ]
    });
    const sharedWhere = (
        userId: number,
        filter: StudentQuery["filter"]
    ): MyPrisma.PeriodPlanningWhereInput => {
        const visibility = {
            OR: [
                { visibility: "PUBLIC" as const },
                {
                    visibility: "FRIENDS" as const,
                    user: { friendshipsAsA: { some: findFriend(userId) } }
                },
                {
                    visibility: "FRIENDS" as const,
                    user: { friendshipsAsB: { some: findFriend(userId) } }
                }
            ]
        };
        const filterWhere = compileFilterWhere(
            filter,
            studentFilterWhere,
            "user shared period plannings"
        );
        return filterWhere.length
            ? { AND: [visibility, ...filterWhere] }
            : visibility;
    };
    return {
        async listPublic(input) {
            const pagination = resolvePagination(
                input,
                sharedPeriodPlanningPagination
            );
            const where = publicWhere(input);
            const [rows, total] = await Promise.all([
                prisma.periodPlanning.findMany({
                    ...selection,
                    where,
                    orderBy: compileSort(
                        resolveSort(input.sort, sharedPeriodPlanningSort),
                        {
                            updatedAt: (direction) => ({
                                updatedAt: direction
                            }),
                            name: (direction) => ({ name: direction }),
                            studyPeriodYear: (direction) => ({
                                studyPeriod: { year: direction }
                            }),
                            id: (direction) => ({ id: direction })
                        }
                    ),
                    ...prismaPaginationParams(pagination)
                }),
                prisma.periodPlanning.count({ where })
            ]);
            return {
                items: rows.map(buildShared),
                total,
                pagination
            };
        },
        async getPublic(shareId) {
            const row = await prisma.periodPlanning.findFirst({
                ...selection,
                where: { shareId, visibility: "PUBLIC" }
            });
            return row ? ok(buildShared(row)) : err(notFound());
        },
        async listForUser(userId, input) {
            const pagination = resolvePagination(
                input,
                sharedPeriodPlanningPagination
            );
            const where = sharedWhere(userId, input.filter);
            const [rows, total] = await Promise.all([
                prisma.periodPlanning.findMany({
                    ...selection,
                    where,
                    orderBy: compileSort(
                        resolveSort(input.sort, sharedPeriodPlanningSort),
                        {
                            updatedAt: (direction) => ({
                                updatedAt: direction
                            }),
                            name: (direction) => ({ name: direction }),
                            studyPeriodYear: (direction) => ({
                                studyPeriod: { year: direction }
                            }),
                            id: (direction) => ({ id: direction })
                        }
                    ),
                    ...prismaPaginationParams(pagination)
                }),
                prisma.periodPlanning.count({ where })
            ]);
            return {
                items: rows.map(buildShared),
                total,
                pagination
            };
        },
        async getForUser(userId, shareId) {
            const row = await prisma.periodPlanning.findFirst({
                ...selection,
                where: { shareId, ...sharedWhere(userId, undefined) }
            });
            return row ? ok(buildShared(row)) : err(notFound());
        }
    };
}
