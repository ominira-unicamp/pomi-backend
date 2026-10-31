import IO from "#/modules/planning/student-history-import/StudentHistoryImport.contract.js";
import {
    invalidStudentHistoryImportProblem,
    studentHistoryStudentNotFoundProblem,
    type StudentHistoryImportProblem
} from "#/modules/planning/student-history-import/StudentHistoryImport.problems.js";
import { err, ok, type Result } from "@pomi/api-core";
import { type DatabaseClient } from "@pomi/db";
import z from "zod";
import { planStudentHistoryImport } from "./StudentHistoryImport.rules.js";

type ImportInput = z.infer<typeof IO.body>;
type ImportSummary = z.infer<typeof IO.summary>;

function field(path: string[], message: string) {
    return { code: "INVALID_VALUE", path, message };
}

export type StudentHistoryImportService = {
    import(
        studentId: number,
        input: ImportInput
    ): Promise<Result<ImportSummary, StudentHistoryImportProblem>>;
};

export function createStudentHistoryImportService({
    prisma
}: {
    prisma: DatabaseClient;
}): StudentHistoryImportService {
    return {
        async import(studentId, input) {
            const student = await prisma.student.findUnique({
                where: { id: studentId },
                select: { ra: true }
            });
            if (!student) return err(studentHistoryStudentNotFoundProblem());
            if (student.ra !== input.student.ra)
                return err(
                    invalidStudentHistoryImportProblem([
                        field(
                            ["student", "ra"],
                            "O RA do documento não corresponde ao aluno autenticado."
                        )
                    ])
                );

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
                            in: [
                                ...new Set(
                                    input.semesters.map((item) => item.year)
                                )
                            ]
                        }
                    }
                },
                select: {
                    courseId: true,
                    evaluation: true,
                    catalog: { select: { year: true } }
                }
            });
            const { rows, warnings } = planStudentHistoryImport(
                input.semesters,
                { periods, courses, classes, catalogCourses }
            );

            const result = await prisma.$transaction(async (tx) => {
                let created = 0;
                let updated = 0;
                for (const row of rows) {
                    const existing = await tx.studentCourseAttempt.findFirst({
                        where: {
                            studentId,
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
                                studentId,
                                courseId: row.courseId,
                                studyPeriodId:
                                    row.classId == null
                                        ? row.studyPeriodId
                                        : null,
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
    };
}
