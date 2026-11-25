import type IO from "#/modules/planning/student-absence/StudentAbsence.contract.js";
import type z from "zod";
import { type PrismaStudentAbsencePayload } from "./StudentAbsence.queries.js";

function buildStudentAbsence(
    absence: PrismaStudentAbsencePayload
): z.infer<typeof IO.schema> {
    const { classSchedule, ...data } = absence;
    const { class: classData, ...schedule } = classSchedule;
    return {
        ...data,
        date: absence.date.toISOString().slice(0, 10),
        createdAt: absence.createdAt.toISOString(),
        updatedAt: absence.updatedAt.toISOString(),
        studyPeriodId: classData.studyPeriod.id,
        studyPeriodYear: classData.studyPeriod.year,
        studyPeriodYearPeriod: classData.studyPeriod.yearPeriod,
        courseId: classData.course.id,
        courseCode: classData.course.code,
        classId: classData.id,
        classCode: classData.code,
        dayOfWeek: schedule.dayOfWeek,
        start: schedule.start,
        end: schedule.end
    };
}

export default {
    build: buildStudentAbsence
};
