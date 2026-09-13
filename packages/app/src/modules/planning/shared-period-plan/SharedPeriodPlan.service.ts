import periodPlanningEntity, {
    prismaPeriodPlanningFieldSelection
} from "#/modules/planning/period-plan/PeriodPlan.entity.js";
import IO, {
    sharedPeriodPlanningPagination
} from "#/modules/planning/shared-period-plan/SharedPeriodPlan.contract.js";
import {
    compileFilterWhere,
    err,
    ok,
    prismaPaginationParams,
    prismaWhereFor,
    resolvePagination,
    ResourceNotFoundProblem,
    type FilterWhereBuilder,
    type ResolvedPagination,
    type Result
} from "@pomi/api-core";
import type { MyPrisma, PrismaClient } from "@pomi/db";
import z from "zod";

type SharedPeriodPlan = z.infer<typeof IO.schema>;
type PublicQuery = z.infer<typeof IO.listPublic.request>["query"];
type StudentQuery = z.infer<typeof IO.listForStudent.request>["query"];
type NotFound = ReturnType<typeof ResourceNotFoundProblem.create>;

const periodPlanningWhere = prismaWhereFor<MyPrisma.PeriodPlanningWhereInput>();
const publicFilterWhere = {
    studyPeriodId: periodPlanningWhere.numberAt("studyPeriodId")
} satisfies Record<
    string,
    FilterWhereBuilder<MyPrisma.PeriodPlanningWhereInput>
>;
const studentFilterWhere = {
    ownerPublicId: periodPlanningWhere.stringAt("student.publicId")
} satisfies Record<
    string,
    FilterWhereBuilder<MyPrisma.PeriodPlanningWhereInput>
>;

const selection = {
    ...prismaPeriodPlanningFieldSelection,
    include: {
        ...prismaPeriodPlanningFieldSelection.include,
        student: {
            select: {
                id: true,
                publicId: true,
                publicProfileEnabled: true,
                publicDisplayName: true
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
    const entity = periodPlanningEntity.build(row);
    return {
        shareId: row.shareId,
        name: row.name,
        visibility: row.visibility,
        studyPeriodId: entity.studyPeriodId,
        studyPeriodYear: entity.studyPeriodYear,
        studyPeriodYearPeriod: entity.studyPeriodYearPeriod,
        owner: row.student.publicProfileEnabled
            ? {
                  publicId: row.student.publicId,
                  displayName: row.student.publicDisplayName ?? "Aluno do POMI"
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
                          student: {
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
    listForStudent(
        studentId: number,
        input: StudentQuery
    ): Promise<{
        items: SharedPeriodPlan[];
        total: number;
        pagination: ResolvedPagination;
    }>;
    getForStudent(
        studentId: number,
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
            { studentAId: viewerId, status: "ACCEPTED" as const },
            { studentBId: viewerId, status: "ACCEPTED" as const }
        ]
    });
    const sharedWhere = (
        studentId: number,
        filter: StudentQuery["filter"]
    ): MyPrisma.PeriodPlanningWhereInput => {
        const visibility = {
            OR: [
                { visibility: "PUBLIC" as const },
                {
                    visibility: "FRIENDS" as const,
                    student: { friendshipsAsA: { some: findFriend(studentId) } }
                },
                {
                    visibility: "FRIENDS" as const,
                    student: { friendshipsAsB: { some: findFriend(studentId) } }
                }
            ]
        };
        const filterWhere = compileFilterWhere(
            filter,
            studentFilterWhere,
            "student shared period plannings"
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
                    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
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
        async listForStudent(studentId, input) {
            const pagination = resolvePagination(
                input,
                sharedPeriodPlanningPagination
            );
            const where = sharedWhere(studentId, input.filter);
            const [rows, total] = await Promise.all([
                prisma.periodPlanning.findMany({
                    ...selection,
                    where,
                    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
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
        async getForStudent(studentId, shareId) {
            const row = await prisma.periodPlanning.findFirst({
                ...selection,
                where: { shareId, ...sharedWhere(studentId, undefined) }
            });
            return row ? ok(buildShared(row)) : err(notFound());
        }
    };
}
