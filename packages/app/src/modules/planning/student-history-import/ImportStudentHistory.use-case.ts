import { err, ok } from "@pomi/api-core";
import type { DatabaseClient } from "@pomi/db";
import { planStudentHistoryImport } from "./StudentHistoryImport.rules.js";
import type { ImportStudentHistoryInput } from "./StudentHistoryImport.schemas.js";
export type { ImportStudentHistoryInput } from "./StudentHistoryImport.schemas.js";

export type ImportStudentHistoryFailure =
    | { kind: "user-not-found" }
    | { kind: "ra-mismatch" };

export async function importStudentHistory(
    { prisma }: { prisma: DatabaseClient },
    { userId, input }: { userId: number; input: ImportStudentHistoryInput }
) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { student: { select: { ra: true } } }
    });
    if (!user)
        return err<never, ImportStudentHistoryFailure>({
            kind: "user-not-found"
        });
    if (user.student && user.student.ra !== input.student.ra)
        return err<never, ImportStudentHistoryFailure>({ kind: "ra-mismatch" });

    const periodKeys = input.semesters.map((item) => ({
        year: item.year,
        yearPeriod: item.yearPeriod
    }));
    const codes = input.semesters.flatMap((item) =>
        item.courses.map((course) => course.code)
    );
    const classCodes = input.semesters.flatMap((item) =>
        item.courses.flatMap((course) =>
            course.classCode == null ? [] : [course.classCode]
        )
    );
    const [periods, courses] = await Promise.all([
        prisma.studyPeriod.findMany({ where: { OR: periodKeys } }),
        prisma.course.findMany({
            where: { code: { in: [...new Set(codes)] } },
            select: { id: true, code: true }
        })
    ]);
    const classes = await prisma.class.findMany({
        where: {
            code: { in: [...new Set(classCodes)] },
            courseId: { in: courses.map((course) => course.id) },
            studyPeriodId: { in: periods.map((period) => period.id) }
        },
        select: {
            id: true,
            code: true,
            courseId: true,
            studyPeriodId: true
        }
    });
    const catalogCourses = await prisma.catalogCourse.findMany({
        where: {
            courseId: { in: courses.map((course) => course.id) },
            catalog: {
                year: {
                    in: [...new Set(input.semesters.map((item) => item.year))]
                }
            }
        },
        select: {
            courseId: true,
            evaluation: true,
            catalog: { select: { year: true } }
        }
    });
    const { rows, warnings } = planStudentHistoryImport(input.semesters, {
        periods,
        courses,
        classes,
        catalogCourses
    });

    const result = await prisma.$transaction(async (tx) => {
        let created = 0;
        let updated = 0;
        for (const row of rows) {
            const existing = await tx.studentCourseAttempt.findFirst({
                where: {
                    userId,
                    courseId: row.courseId,
                    OR: [
                        { studyPeriodId: row.studyPeriodId },
                        { class: { studyPeriodId: row.studyPeriodId } }
                    ]
                },
                select: { id: true }
            });
            if (existing) {
                await tx.studentCourseAttempt.update({
                    where: { id: existing.id },
                    data: {
                        ...(row.classId !== undefined
                            ? {
                                  classId: row.classId,
                                  studyPeriodId:
                                      row.classId === null
                                          ? row.studyPeriodId
                                          : null
                              }
                            : row.status === "APPROVED_BY_PROFICIENCY"
                              ? {
                                    classId: null,
                                    studyPeriodId: row.studyPeriodId
                                }
                              : {
                                    studyPeriodId: row.studyPeriodId
                                }),
                        evaluationMode: row.evaluationMode,
                        status: row.status,
                        grade: row.grade
                    }
                });
                updated += 1;
            } else {
                await tx.studentCourseAttempt.create({
                    data: {
                        userId,
                        courseId: row.courseId,
                        studyPeriodId:
                            row.classId == null ? row.studyPeriodId : null,
                        classId: row.classId ?? null,
                        evaluationMode: row.evaluationMode,
                        status: row.status,
                        grade: row.grade
                    }
                });
                created += 1;
            }
        }
        return { created, updated };
    });
    return ok({
        ...result,
        skipped: warnings.length,
        warnings
    });
}
