import type IO from "#/modules/planning/student-course-attempt/StudentCourseAttempt.contract.js";
import type z from "zod";
import { type PrismaStudentCoursePayload } from "./StudentCourseAttempt.queries.js";

function buildStudentCourseAttempt(
    attempt: PrismaStudentCoursePayload
): z.infer<typeof IO.schema> {
    const {
        course,
        studyPeriod: storedStudyPeriod,
        class: classData,
        studyPeriodId: _storedStudyPeriodId,
        grade,
        createdAt,
        updatedAt,
        ...rest
    } = attempt;
    const resolvedStudyPeriod = classData?.studyPeriod ?? storedStudyPeriod;
    return {
        ...rest,
        studyPeriodId: resolvedStudyPeriod?.id ?? null,
        grade: grade === null ? null : Number(grade),
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
        course,
        studyPeriod: resolvedStudyPeriod
            ? {
                  id: resolvedStudyPeriod.id,
                  year: resolvedStudyPeriod.year,
                  yearPeriod: resolvedStudyPeriod.yearPeriod
              }
            : null,
        class: classData
            ? {
                  id: classData.id,
                  code: classData.code,
                  professors: classData.professors
              }
            : null
    };
}

export default {
    build: buildStudentCourseAttempt
};
