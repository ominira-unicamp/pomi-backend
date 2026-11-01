import type {
    EvaluationMode,
    YearPeriod
} from "#/modules/academic/Academic.types.js";
export type HistoryStatus =
    | "ENROLLED"
    | "APPROVED"
    | "APPROVED_BY_ATTENDANCE"
    | "APPROVED_BY_PROFICIENCY"
    | "DROPPED"
    | "FAILED_BY_ATTENDANCE"
    | "SUFFICIENT";
export type HistorySemester = {
    year: number;
    yearPeriod: YearPeriod;
    courses: {
        code: string;
        classCode?: string | null;
        status: HistoryStatus;
        grade: number | null;
    }[];
};
type Warning = {
    year: number | null;
    yearPeriod: string | null;
    code: string | null;
    message: string;
};
function statusAllowed(evaluation: EvaluationMode, status: HistoryStatus) {
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
export function planStudentHistoryImport(
    semesters: readonly HistorySemester[],
    facts: {
        periods: readonly {
            id: number;
            year: number;
            yearPeriod: YearPeriod;
        }[];
        courses: readonly { id: number; code: string }[];
        classes: readonly {
            id: number;
            courseId: number;
            studyPeriodId: number;
            code: string;
        }[];
        catalogCourses: readonly {
            courseId: number;
            evaluation: EvaluationMode | null;
            catalog: { year: number };
        }[];
    }
) {
    const periodByKey = new Map(
        facts.periods.map((period) => [
            `${period.year}:${period.yearPeriod}`,
            period
        ])
    );
    const courseByCode = new Map(
        facts.courses.map((course) => [course.code, course])
    );
    const classByKey = new Map(
        facts.classes.map((classData) => [
            `${classData.courseId}:${classData.studyPeriodId}:${classData.code}`,
            classData
        ])
    );
    const evaluationByCourseYear = new Map(
        facts.catalogCourses
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
        evaluationMode: EvaluationMode;
        status: HistoryStatus;
        grade: number | null;
        classId: number | null | undefined;
    }> = [];
    const seen = new Set<string>();
    for (const semester of semesters) {
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
                    message: "Disciplina não encontrada no catálogo local."
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
            if (classData && course.status === "APPROVED_BY_PROFICIENCY") {
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

    return { rows, warnings };
}
