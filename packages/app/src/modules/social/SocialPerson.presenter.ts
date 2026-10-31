import type z from "zod";
import type { person } from "./Social.schemas.js";
import type { SelectedPerson } from "./SocialPerson.queries.js";
type Person = z.infer<typeof person>;
export function buildPerson(
    student: SelectedPerson,
    viewerStudentId: number,
    forceMinimal = false,
    acceptedFriendIds?: ReadonlySet<number>
): Person {
    const disclose = student.publicProfileEnabled && !forceMinimal;
    const canViewCurrentCourses =
        !forceMinimal &&
        (student.id === viewerStudentId ||
            student.currentCoursesVisibility === "PUBLIC" ||
            (student.currentCoursesVisibility === "FRIENDS" &&
                acceptedFriendIds?.has(student.id) === true));
    return {
        publicId: student.publicId,
        displayName: student.publicDisplayName ?? student.name,
        avatarMediaId: disclose ? student.avatarMediaId : null,
        bio: disclose ? student.publicBio : null,
        interests: disclose
            ? student.tagInterests
                  .map(({ tag }) => ({ id: tag.id, name: tag.name }))
                  .sort((left, right) =>
                      left.name.localeCompare(right.name, "pt-BR")
                  )
            : [],
        currentCourses: canViewCurrentCourses
            ? student.courseAttempts.map(({ course, class: classData }) => ({
                  courseCode: course.code,
                  courseName: course.name,
                  classCode: classData?.code ?? null,
                  schedules:
                      classData?.classSchedules.map((schedule) => ({
                          id: schedule.id,
                          dayOfWeek: schedule.dayOfWeek,
                          start: schedule.start,
                          end: schedule.end,
                          roomCode: schedule.room.code
                      })) ?? []
              }))
            : [],
        program: disclose ? student.program : null,
        specialization: disclose ? student.specialization : null,
        entryYear: disclose ? student.entryYear : null
    };
}
