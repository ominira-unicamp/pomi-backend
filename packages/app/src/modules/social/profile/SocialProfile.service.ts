import { err, ok, type Result } from "@pomi/api-core";
import type { PrismaClient } from "@pomi/db";
import type z from "zod";
import { socialNotFoundProblem } from "../Social.problems.js";
import type { ownProfile } from "../Social.schemas.js";
import type { SelectedPerson } from "../SocialPerson.queries.js";
import { personSelection } from "../SocialPerson.queries.js";
import type IO from "./SocialProfile.contract.js";

type NotFoundProblem = ReturnType<typeof socialNotFoundProblem>;
type Profile = z.infer<typeof ownProfile>;
type ProfileBody = z.infer<typeof IO.updateProfile.request>["body"];

function buildProfile(student: SelectedPerson): Profile {
    return {
        publicId: student.publicId,
        displayName: student.publicDisplayName ?? student.name,
        avatarMediaId: student.avatarMediaId,
        bio: student.publicBio,
        interests: student.tagInterests
            .map(({ tag }) => ({ id: tag.id, name: tag.name }))
            .sort((left, right) =>
                left.name.localeCompare(right.name, "pt-BR")
            ),
        currentCourses: student.courseAttempts.map(
            ({ course, class: classData }) => ({
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
            })
        ),
        program: student.program,
        specialization: student.specialization,
        entryYear: student.entryYear,
        enabled: student.publicProfileEnabled,
        currentCoursesVisibility: student.currentCoursesVisibility
    };
}

export type SocialProfileService = {
    getProfile(studentId: number): Promise<Result<Profile, NotFoundProblem>>;
    updateProfile(
        studentId: number,
        input: ProfileBody
    ): Promise<Result<Profile, NotFoundProblem>>;
};

export function createSocialProfileService({
    prisma
}: {
    prisma: PrismaClient;
}): SocialProfileService {
    return {
        async getProfile(studentId) {
            const student = await prisma.student.findUnique({
                where: { id: studentId },
                select: personSelection
            });
            return student
                ? ok(buildProfile(student))
                : err(
                      socialNotFoundProblem(
                          "O aluno solicitado não foi encontrado."
                      )
                  );
        },
        async updateProfile(studentId, input) {
            const existing = await prisma.student.findUnique({
                where: { id: studentId },
                select: { id: true }
            });
            if (!existing)
                return err(
                    socialNotFoundProblem(
                        "O aluno solicitado não foi encontrado."
                    )
                );
            const student = await prisma.student.update({
                where: { id: studentId },
                data: {
                    publicProfileEnabled: input.enabled,
                    publicDisplayName: input.displayName,
                    publicBio: input.bio,
                    currentCoursesVisibility: input.currentCoursesVisibility
                },
                select: personSelection
            });
            return ok(buildProfile(student));
        }
    };
}
