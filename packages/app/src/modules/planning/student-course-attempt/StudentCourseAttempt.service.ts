import IO, {
    studentCourseAttemptSort
} from "#/modules/planning/student-course-attempt/StudentCourseAttempt.contract.js";
import attemptPresenter from "#/modules/planning/student-course-attempt/StudentCourseAttempt.presenter.js";
import {
    activeStudentCourseAttemptProblem,
    invalidStudentCourseAttemptProblem,
    studentCourseAttemptNotFoundProblem,
    studentCourseReferenceNotFoundProblem,
    type StudentCourseAttemptProblem
} from "#/modules/planning/student-course-attempt/StudentCourseAttempt.problems.js";
import { prismaStudentCourseFieldSelection } from "#/modules/planning/student-course-attempt/StudentCourseAttempt.queries.js";
import {
    compileFilterWhere,
    compileSort,
    err,
    ok,
    prismaPaginationParams,
    prismaWhereFor,
    resolvePagination,
    resolveSort,
    scalarFilter,
    unpaginatedByDefault,
    type FilterExpression,
    type FilterWhereBuilder,
    type PageResult,
    type Result
} from "@pomi/api-core";
import {
    type CourseEvaluationMode,
    type MyPrisma,
    type PrismaClient
} from "@pomi/db";
import z from "zod";
import { validateAttemptFacts } from "./StudentCourseAttempt.rules.js";

type Attempt = z.infer<typeof IO.schema>;
type CreateInput = z.infer<typeof IO.create.request>["body"];
type PatchInput = z.infer<typeof IO.patch.request>["body"];
type ListInput = z.infer<typeof IO.list.request>["query"];
type AttemptInput = Pick<
    CreateInput,
    | "courseId"
    | "studyPeriodId"
    | "classId"
    | "evaluationMode"
    | "status"
    | "grade"
>;

const attemptWhere = prismaWhereFor<MyPrisma.StudentCourseAttemptWhereInput>();
const attemptFilterWhere = {
    status: attemptWhere.enumAt("status"),
    courseId: attemptWhere.numberAt("courseId"),
    studyPeriodId: (expression: FilterExpression) => ({
        OR: [
            {
                studyPeriodId: scalarFilter(
                    expression.operator,
                    expression.values,
                    Number
                )
            },
            {
                class: {
                    studyPeriodId: scalarFilter(
                        expression.operator,
                        expression.values,
                        Number
                    )
                }
            }
        ]
    })
} satisfies Record<
    string,
    FilterWhereBuilder<MyPrisma.StudentCourseAttemptWhereInput>
>;

export type StudentCourseAttemptService = {
    list(userId: number, input: ListInput): Promise<PageResult<Attempt>>;
    getById(
        userId: number,
        id: number
    ): Promise<
        Result<Attempt, ReturnType<typeof studentCourseAttemptNotFoundProblem>>
    >;
    create(
        userId: number,
        input: CreateInput
    ): Promise<
        Result<
            Attempt,
            Exclude<
                StudentCourseAttemptProblem,
                ReturnType<typeof studentCourseAttemptNotFoundProblem>
            >
        >
    >;
    patch(
        userId: number,
        id: number,
        input: PatchInput
    ): Promise<Result<Attempt, StudentCourseAttemptProblem>>;
    remove(
        userId: number,
        id: number
    ): Promise<
        Result<void, ReturnType<typeof studentCourseAttemptNotFoundProblem>>
    >;
};

type ValidationIssue = { code: string; path: string[]; message: string };

async function validateAttempt(
    prisma: PrismaClient,
    input: AttemptInput
): Promise<
    | { kind: "reference"; fields: ValidationIssue[] }
    | { kind: "invalid"; fields: ValidationIssue[] }
    | {
          kind: "valid";
          evaluationMode: CourseEvaluationMode;
          studyPeriodId: number | null;
      }
> {
    const [course, period, classData] = await Promise.all([
        prisma.course.findUnique({
            where: { id: input.courseId },
            select: { id: true }
        }),
        input.studyPeriodId == null
            ? undefined
            : prisma.studyPeriod.findUnique({
                  where: { id: input.studyPeriodId },
                  select: { id: true }
              }),
        input.classId == null
            ? undefined
            : prisma.class.findUnique({
                  where: { id: input.classId },
                  select: {
                      courseId: true,
                      studyPeriod: { select: { id: true, year: true } }
                  }
              })
    ]);
    const referencesValid =
        !!course &&
        (input.studyPeriodId == null || !!period) &&
        (input.classId == null || !!classData);
    const catalogCourse =
        referencesValid &&
        input.status !== "APPROVED_BY_PROFICIENCY" &&
        classData
            ? await prisma.catalogCourse.findFirst({
                  where: {
                      courseId: classData.courseId,
                      catalog: { year: classData.studyPeriod.year },
                      evaluation: { not: null }
                  },
                  select: { evaluation: true }
              })
            : undefined;
    const result = validateAttemptFacts(input, {
        courseFound: !!course,
        periodFound: !!period,
        classData,
        catalogCourse
    });
    return result.isErr() ? result.error : result.value;
}

export function createStudentCourseAttemptService({
    prisma
}: {
    prisma: PrismaClient;
}): StudentCourseAttemptService {
    return {
        async list(userId, input) {
            const filterWhere = compileFilterWhere(
                input.filter,
                attemptFilterWhere,
                "user course attempts"
            );
            const pagination = resolvePagination(input, unpaginatedByDefault);
            const where: MyPrisma.StudentCourseAttemptWhereInput = {
                AND: [{ userId }, ...filterWhere]
            };
            const total = await prisma.studentCourseAttempt.count({ where });
            const attempts = await prisma.studentCourseAttempt.findMany({
                ...prismaPaginationParams(pagination),
                ...prismaStudentCourseFieldSelection,
                where,
                orderBy: compileSort(
                    resolveSort(input.sort, studentCourseAttemptSort),
                    {
                        createdAt: (direction) => ({ createdAt: direction }),
                        updatedAt: (direction) => ({ updatedAt: direction }),
                        courseCode: (direction) => ({
                            course: { code: direction }
                        }),
                        status: (direction) => ({ status: direction }),
                        grade: (direction) => ({ grade: direction }),
                        id: (direction) => ({ id: direction })
                    }
                )
            });
            return {
                items: attempts.map(attemptPresenter.build),
                total,
                pagination
            };
        },
        async getById(userId, id) {
            const attempt = await prisma.studentCourseAttempt.findFirst({
                ...prismaStudentCourseFieldSelection,
                where: { id, userId }
            });
            return attempt
                ? ok(attemptPresenter.build(attempt))
                : err(studentCourseAttemptNotFoundProblem());
        },
        async create(userId, input) {
            const validation = await validateAttempt(prisma, input);
            if (validation.kind === "reference")
                return err(
                    studentCourseReferenceNotFoundProblem(validation.fields)
                );
            if (validation.kind === "invalid")
                return err(
                    invalidStudentCourseAttemptProblem(validation.fields)
                );
            if (input.status === "ENROLLED") {
                const active = await prisma.studentCourseAttempt.findFirst({
                    where: {
                        userId,
                        courseId: input.courseId,
                        status: "ENROLLED"
                    },
                    select: { id: true }
                });
                if (active) return err(activeStudentCourseAttemptProblem());
            }
            const attempt = await prisma.studentCourseAttempt.create({
                ...prismaStudentCourseFieldSelection,
                data: {
                    userId,
                    courseId: input.courseId,
                    classId: input.classId ?? null,
                    studyPeriodId: validation.studyPeriodId,
                    evaluationMode: validation.evaluationMode,
                    status: input.status,
                    grade: input.grade ?? null
                }
            });
            return ok(attemptPresenter.build(attempt));
        },
        async patch(userId, id, input) {
            const existing = await prisma.studentCourseAttempt.findFirst({
                where: { id, userId }
            });
            if (!existing) return err(studentCourseAttemptNotFoundProblem());
            const next: AttemptInput = {
                courseId: existing.courseId,
                studyPeriodId: existing.studyPeriodId,
                classId: existing.classId,
                evaluationMode:
                    input.evaluationMode ??
                    (input.classId !== undefined &&
                    input.classId !== existing.classId
                        ? undefined
                        : existing.evaluationMode),
                status: existing.status,
                grade: existing.grade === null ? null : Number(existing.grade),
                ...input
            };
            const validation = await validateAttempt(prisma, next);
            if (validation.kind === "reference")
                return err(
                    studentCourseReferenceNotFoundProblem(validation.fields)
                );
            if (validation.kind === "invalid")
                return err(
                    invalidStudentCourseAttemptProblem(validation.fields)
                );
            if (next.status === "ENROLLED") {
                const active = await prisma.studentCourseAttempt.findFirst({
                    where: {
                        userId,
                        courseId: next.courseId,
                        status: "ENROLLED",
                        id: { not: id }
                    },
                    select: { id: true }
                });
                if (active) return err(activeStudentCourseAttemptProblem());
            }
            const attempt = await prisma.studentCourseAttempt.update({
                ...prismaStudentCourseFieldSelection,
                where: { id },
                data: {
                    classId: next.classId,
                    studyPeriodId: validation.studyPeriodId,
                    evaluationMode: validation.evaluationMode,
                    status: next.status,
                    grade: next.grade ?? null
                }
            });
            return ok(attemptPresenter.build(attempt));
        },
        async remove(userId, id) {
            const existing = await prisma.studentCourseAttempt.findFirst({
                where: { id, userId },
                select: { id: true }
            });
            if (!existing) return err(studentCourseAttemptNotFoundProblem());
            await prisma.studentCourseAttempt.delete({ where: { id } });
            return ok(undefined);
        }
    };
}
