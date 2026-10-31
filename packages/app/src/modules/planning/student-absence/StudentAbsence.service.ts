import IO, {
    studentAbsenceSort
} from "#/modules/planning/student-absence/StudentAbsence.contract.js";
import absenceEntity from "#/modules/planning/student-absence/StudentAbsence.entity.js";
import {
    duplicateStudentAbsenceProblem,
    invalidStudentAbsenceProblem,
    studentAbsenceNotFoundProblem,
    studentAbsenceReferenceNotFoundProblem,
    type StudentAbsenceProblem
} from "#/modules/planning/student-absence/StudentAbsence.problems.js";
import {
    compileFilterWhere,
    compileSort,
    err,
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
type CreateInput = z.infer<typeof IO.create.request>["body"];
type ListInput = z.infer<typeof IO.list.request>["query"];
type CreateProblem = Exclude<
    StudentAbsenceProblem,
    ReturnType<typeof studentAbsenceNotFoundProblem>
>;

const absenceWhere = prismaWhereFor<MyPrisma.StudentAbsenceWhereInput>();
const absenceFilterWhere = {
    courseAttemptId: absenceWhere.numberAt("studentCourseAttempt.id")
} satisfies Record<
    string,
    FilterWhereBuilder<MyPrisma.StudentAbsenceWhereInput>
>;

export type StudentAbsenceService = {
    list(studentId: number, input: ListInput): Promise<Absence[]>;
    create(
        studentId: number,
        input: CreateInput
    ): Promise<Result<Absence, CreateProblem>>;
    remove(
        studentId: number,
        id: number
    ): Promise<Result<void, ReturnType<typeof studentAbsenceNotFoundProblem>>>;
};

export function createStudentAbsenceService({
    prisma
}: {
    prisma: PrismaClient;
}): StudentAbsenceService {
    return {
        async list(studentId, input) {
            const filterWhere = compileFilterWhere(
                input.filter,
                absenceFilterWhere,
                "student absences"
            );
            const absences = await prisma.studentAbsence.findMany({
                ...absenceEntity.prismaSelection,
                where: {
                    AND: [
                        { studentCourseAttempt: { studentId } },
                        ...filterWhere
                    ]
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
            return absences.map(absenceEntity.build);
        },
        async create(studentId, input) {
            const [attempt, schedule] = await Promise.all([
                prisma.studentCourseAttempt.findFirst({
                    where: { id: input.courseAttemptId, studentId },
                    select: { id: true, classId: true }
                }),
                prisma.classSchedule.findUnique({
                    where: { id: input.classScheduleId },
                    select: { id: true, classId: true, dayOfWeek: true }
                })
            ]);
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
                ...absenceEntity.prismaSelection,
                data: {
                    studentCourseAttemptId: input.courseAttemptId,
                    classScheduleId: input.classScheduleId,
                    date: new Date(`${input.date}T00:00:00.000Z`)
                }
            });
            return ok(absenceEntity.build(absence));
        },
        async remove(studentId, id) {
            const absence = await prisma.studentAbsence.findFirst({
                where: { id, studentCourseAttempt: { studentId } },
                select: { id: true }
            });
            if (!absence) return err(studentAbsenceNotFoundProblem());
            await prisma.studentAbsence.delete({ where: { id } });
            return ok(undefined);
        }
    };
}
