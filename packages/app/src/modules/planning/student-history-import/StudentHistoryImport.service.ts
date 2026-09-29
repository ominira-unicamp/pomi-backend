import IO from "#/modules/planning/student-history-import/StudentHistoryImport.contract.js";
import {
    invalidStudentHistoryImportProblem,
    studentHistoryStudentNotFoundProblem,
    type StudentHistoryImportProblem
} from "#/modules/planning/student-history-import/StudentHistoryImport.problems.js";
import { err, ok, type Result } from "@pomi/api-core";
import { type CourseEvaluationMode, type DatabaseClient } from "@pomi/db";
import z from "zod";

type ImportInput = z.infer<typeof IO.body>;
type ImportSummary = z.infer<typeof IO.summary>;
type Warning = ImportSummary["warnings"][number];

function field(path: string[], message: string) {
    return { code: "INVALID_VALUE", path, message };
}

function statusAllowed(
    evaluation: CourseEvaluationMode,
    status: ImportInput["semesters"][number]["courses"][number]["status"]
) {
    if (status === "ENROLLED") return true;
    if (status === "APPROVED_BY_PROFICIENCY") return true;
    if (status === "DROPPED") return true;
    if (evaluation === "CONCEPT") return status === "SUFFICIENT";
    if (evaluation === "ATTENDANCE")
        return ["APPROVED_BY_ATTENDANCE", "FAILED_BY_ATTENDANCE"].includes(
            status
        );
    return ["APPROVED", "FAILED_BY_ATTENDANCE"].includes(status);
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
            const periodByKey = new Map(
                periods.map((period) => [
                    `${period.year}:${period.yearPeriod}`,
                    period
                ])
            );
            const courseByCode = new Map(
                courses.map((course) => [course.code, course])
            );
            const classByKey = new Map(
                classes.map((classData) => [
                    `${classData.courseId}:${classData.studyPeriodId}:${classData.code}`,
                    classData
                ])
            );
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
            const evaluationByCourseYear = new Map(
                catalogCourses
                    .filter((item) => item.evaluation !== null)
                    .map((item) => [
                        `${item.courseId}:${item.catalog.year}`,
                        item.evaluation!
                    ])
            );

            const warnings: Warning[] = [];
            const rows: Array<{
                courseId: number;
                studyPeriodId: number;
                evaluationMode: CourseEvaluationMode;
                status: ImportInput["semesters"][number]["courses"][number]["status"];
                grade: number | null;
                classId: number | null | undefined;
            }> = [];
            const seen = new Set<string>();
            for (const semester of input.semesters) {
                const period = periodByKey.get(
                    `${semester.year}:${semester.yearPeriod}`
                );
                for (const course of semester.courses) {
                    const warningBase = {
                        year: semester.year,
                        yearPeriod: semester.yearPeriod,
                        code: course.code
                    };
                    if (!period) {
                        warnings.push({
                            ...warningBase,
                            message: "Período letivo não encontrado."
                        });
                        continue;
                    }
                    const persistedCourse = courseByCode.get(course.code);
                    if (!persistedCourse) {
                        warnings.push({
                            ...warningBase,
                            message:
                                "Disciplina não encontrada no catálogo local."
                        });
                        continue;
                    }
                    const key = `${persistedCourse.id}:${period.id}`;
                    if (seen.has(key)) {
                        warnings.push({
                            ...warningBase,
                            message: "Disciplina repetida no mesmo semestre."
                        });
                        continue;
                    }
                    seen.add(key);
                    const classData =
                        course.classCode == null
                            ? undefined
                            : classByKey.get(
                                  `${persistedCourse.id}:${period.id}:${course.classCode}`
                              );
                    if (course.classCode != null && !classData) {
                        warnings.push({
                            ...warningBase,
                            message: "Turma não encontrada."
                        });
                        continue;
                    }
                    if (
                        classData &&
                        (classData.courseId !== persistedCourse.id ||
                            classData.studyPeriodId !== period.id)
                    ) {
                        warnings.push({
                            ...warningBase,
                            message:
                                "A turma não pertence à disciplina e ao período informados."
                        });
                        continue;
                    }
                    if (
                        classData &&
                        course.status === "APPROVED_BY_PROFICIENCY"
                    ) {
                        warnings.push({
                            ...warningBase,
                            message:
                                "Uma disciplina aprovada por proficiência não pode estar vinculada a uma turma."
                        });
                        continue;
                    }
                    const evaluation = evaluationByCourseYear.get(
                        `${persistedCourse.id}:${semester.year}`
                    );
                    if (!evaluation) {
                        warnings.push({
                            ...warningBase,
                            message:
                                "Modalidade de avaliação não encontrada no catálogo."
                        });
                        continue;
                    }
                    if (!statusAllowed(evaluation, course.status)) {
                        warnings.push({
                            ...warningBase,
                            message:
                                "Situação incompatível com a modalidade de avaliação do catálogo."
                        });
                        continue;
                    }
                    rows.push({
                        courseId: persistedCourse.id,
                        studyPeriodId: period.id,
                        evaluationMode: evaluation,
                        status: course.status,
                        grade: course.grade,
                        classId:
                            course.classCode === undefined
                                ? undefined
                                : (classData?.id ?? null)
                    });
                }
            }

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
