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

function buildProfile(user: SelectedPerson): Profile {
    return {
        publicId: user.publicId,
        displayName: user.publicDisplayName ?? user.name ?? "Usuário do POMI",
        avatarMediaId: user.avatarMediaId,
        bio: user.publicBio,
        interests: user.tagInterests
            .map(({ tag }) => ({ id: tag.id, name: tag.name }))
            .sort((left, right) =>
                left.name.localeCompare(right.name, "pt-BR")
            ),
        currentCourses: user.courseAttempts.map(
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
        program: user.student?.program ?? null,
        specialization: user.student?.specialization ?? null,
        entryYear: user.student?.entryYear ?? null,
        enabled: user.publicProfileEnabled,
        currentCoursesVisibility: user.currentCoursesVisibility
    };
}

export type SocialProfileService = {
    getProfile(userId: number): Promise<Result<Profile, NotFoundProblem>>;
    updateProfile(
        userId: number,
        input: ProfileBody
    ): Promise<Result<Profile, NotFoundProblem>>;
};

export function createSocialProfileService({
    prisma
}: {
    prisma: PrismaClient;
}): SocialProfileService {
    return {
        async getProfile(userId) {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: personSelection
            });
            return user
                ? ok(buildProfile(user))
                : err(
                      socialNotFoundProblem(
                          "O usuário solicitado não foi encontrado."
                      )
                  );
        },
        async updateProfile(userId, input) {
            const existing = await prisma.user.findUnique({
                where: { id: userId },
                select: { id: true }
            });
            if (!existing)
                return err(
                    socialNotFoundProblem(
                        "O usuário solicitado não foi encontrado."
                    )
                );
            const user = await prisma.user.update({
                where: { id: userId },
                data: {
                    publicProfileEnabled: input.enabled,
                    publicDisplayName: input.displayName,
                    publicBio: input.bio,
                    currentCoursesVisibility: input.currentCoursesVisibility
                },
                select: personSelection
            });
            return ok(buildProfile(user));
        }
    };
}
