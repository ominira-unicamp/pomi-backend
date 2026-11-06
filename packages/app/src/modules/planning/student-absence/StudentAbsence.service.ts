import IO, {
    studentAbsenceSort
} from "#/modules/planning/student-absence/StudentAbsence.contract.js";
import absencePresenter from "#/modules/planning/student-absence/StudentAbsence.presenter.js";
import {
    duplicateStudentAbsenceProblem,
    invalidStudentAbsenceProblem,
    studentAbsenceNotFoundProblem,
    studentAbsenceReferenceNotFoundProblem,
    type StudentAbsenceProblem
} from "#/modules/planning/student-absence/StudentAbsence.problems.js";
import { prismaStudentAbsenceSelection } from "#/modules/planning/student-absence/StudentAbsence.queries.js";
import {
    compileFilterWhere,
    compileSort,
    err,
    NotFoundError,
    ok,
    prismaWhereFor,
    resolveSort,
    type FilterWhereBuilder,
    type Result
} from "@pomi/api-core";
import type { MyPrisma, PrismaClient } from "@pomi/db";
import z from "zod";
import { validateAbsenceFacts } from "./StudentAbsence.rules.js";

type Absence = z.infer<typeof IO.schema>;
type CreateInput = z.infer<typeof IO.create.request>["body"] & {
    courseAttemptId: number;
};
type ListInput = z.infer<typeof IO.list.request>["query"];
type CreateProblem = Exclude<
    StudentAbsenceProblem,
    ReturnType<typeof studentAbsenceNotFoundProblem>
>;

const absenceWhere = prismaWhereFor<MyPrisma.StudentAbsenceWhereInput>();
const absenceFilterWhere = {
    courseAttemptId: absenceWhere.numberAt("studentCourseAttemptId")
} satisfies Record<
    string,
    FilterWhereBuilder<MyPrisma.StudentAbsenceWhereInput>
>;

export type StudentAbsenceService = {
    list(userId: number, input: ListInput): Promise<Absence[]>;
    create(
        userId: number,
        input: CreateInput
    ): Promise<Result<Absence, CreateProblem>>;
    remove(
        userId: number,
        id: number,
        courseAttemptId?: number
    ): Promise<Result<void, ReturnType<typeof studentAbsenceNotFoundProblem>>>;
};

export function createStudentAbsenceService({
    prisma
}: {
    prisma: PrismaClient;
}): StudentAbsenceService {
    return {
        async list(userId, input) {
            const filterWhere = compileFilterWhere(
                input.filter,
                absenceFilterWhere,
                "student absences"
            );
            const absences = await prisma.studentAbsence.findMany({
                ...prismaStudentAbsenceSelection,
                where: {
                    AND: [{ studentCourseAttempt: { userId } }, ...filterWhere]
                },
                orderBy: compileSort(
                    resolveSort(input.sort, studentAbsenceSort),
                    {
                        date: (direction) => ({ date: direction }),
                        courseCode: (direction) => ({
                            studentCourseAttempt: {
                                course: { code: direction }
                            }
                        }),
                        classCode: (direction) => ({
                            classSchedule: { class: { code: direction } }
                        }),
                        start: (direction) => ({
                            classSchedule: { start: direction }
                        }),
                        createdAt: (direction) => ({ createdAt: direction }),
                        id: (direction) => ({ id: direction })
                    }
                )
            });
            return absences.map(absencePresenter.build);
        },
        async create(userId, input) {
            const [attempt, schedule] = await Promise.all([
                prisma.studentCourseAttempt.findFirst({
                    where: { id: input.courseAttemptId, userId },
                    select: { id: true, classId: true }
                }),
                prisma.classSchedule.findUnique({
                    where: { id: input.classScheduleId },
                    select: { id: true, classId: true, dayOfWeek: true }
                })
            ]);
            if (!attempt)
                throw new NotFoundError(
                    "Registro acadêmico não encontrado para este usuário."
                );
            const validation = validateAbsenceFacts(input, attempt, schedule);
            if (validation.isErr())
                return err(
                    validation.error.kind === "reference"
                        ? studentAbsenceReferenceNotFoundProblem(
                              validation.error.fields
                          )
                        : invalidStudentAbsenceProblem(validation.error.fields)
                );
            const existing = await prisma.studentAbsence.findUnique({
                where: {
                    studentCourseAttemptId_classScheduleId_date: {
                        studentCourseAttemptId: input.courseAttemptId,
                        classScheduleId: input.classScheduleId,
                        date: new Date(`${input.date}T00:00:00.000Z`)
                    }
                },
                select: { id: true }
            });
            if (existing) return err(duplicateStudentAbsenceProblem());
            const absence = await prisma.studentAbsence.create({
                ...prismaStudentAbsenceSelection,
                data: {
                    studentCourseAttemptId: input.courseAttemptId,
                    classScheduleId: input.classScheduleId,
                    date: new Date(`${input.date}T00:00:00.000Z`)
                }
            });
            return ok(absencePresenter.build(absence));
        },
        async remove(userId, id, courseAttemptId) {
            const absence = await prisma.studentAbsence.findFirst({
                where: {
                    id,
                    studentCourseAttemptId: courseAttemptId,
                    studentCourseAttempt: { userId }
                },
                select: { id: true }
            });
            if (!absence) return err(studentAbsenceNotFoundProblem());
            await prisma.studentAbsence.delete({ where: { id } });
            return ok(undefined);
        }
    };
}
