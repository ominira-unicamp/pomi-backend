import type z from "zod";
import type { person } from "./Social.schemas.js";
import type { SelectedPerson } from "./SocialPerson.queries.js";
type Person = z.infer<typeof person>;
export function decidePersonDisclosure(facts: {
    profileEnabled: boolean;
    forceMinimal: boolean;
    isOwner: boolean;
    currentCoursesVisibility: "PRIVATE" | "FRIENDS" | "PUBLIC";
    acceptedFriend: boolean;
}) {
    return {
        showProfile: facts.profileEnabled && !facts.forceMinimal,
        showCurrentCourses:
            !facts.forceMinimal &&
            (facts.isOwner ||
                facts.currentCoursesVisibility === "PUBLIC" ||
                (facts.currentCoursesVisibility === "FRIENDS" &&
                    facts.acceptedFriend))
    };
}

export function buildPerson(
    user: SelectedPerson,
    disclosure: ReturnType<typeof decidePersonDisclosure>
): Person {
    return {
        publicId: user.publicId,
        displayName:
            user.publicDisplayName ??
            user.student?.name ??
            user.name ??
            "Usuário do POMI",
        avatarMediaId: disclosure.showProfile ? user.avatarMediaId : null,
        bio: disclosure.showProfile ? user.publicBio : null,
        interests: disclosure.showProfile
            ? user.tagInterests
                  .map(({ tag }) => ({ id: tag.id, name: tag.name }))
                  .sort((left, right) =>
                      left.name.localeCompare(right.name, "pt-BR")
                  )
            : [],
        currentCourses: disclosure.showCurrentCourses
            ? user.courseAttempts.map(({ course, class: classData }) => ({
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
        program: disclosure.showProfile
            ? (user.student?.program ?? null)
            : null,
        specialization: disclosure.showProfile
            ? (user.student?.specialization ?? null)
            : null,
        entryYear: disclosure.showProfile
            ? (user.student?.entryYear ?? null)
            : null
    };
}
