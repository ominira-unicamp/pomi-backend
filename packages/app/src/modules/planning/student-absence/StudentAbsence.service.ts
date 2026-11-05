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
    compileSort,
    err,
    NotFoundError,
    ok,
    resolveSort,
    type Result
} from "@pomi/api-core";
import type { PrismaClient } from "@pomi/db";
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

export type StudentAbsenceService = {
    list(
        userId: number,
        input: ListInput,
        courseAttemptId: number
    ): Promise<Absence[]>;
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
        async list(userId, input, courseAttemptId) {
            if (
                !(await prisma.studentCourseAttempt.findFirst({
                    where: { id: courseAttemptId, userId },
                    select: { id: true }
                }))
            )
                throw new NotFoundError(
                    "Registro acadêmico não encontrado para este usuário."
                );
            const absences = await prisma.studentAbsence.findMany({
                ...prismaStudentAbsenceSelection,
                where: {
                    studentCourseAttemptId: courseAttemptId,
                    studentCourseAttempt: { userId }
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
