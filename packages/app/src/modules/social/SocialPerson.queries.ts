export const personSelection = {
    id: true,
    publicId: true,
    name: true,
    avatarMediaId: true,
    publicProfileEnabled: true,
    publicDisplayName: true,
    publicBio: true,
    currentCoursesVisibility: true,
    entryYear: true,
    tagInterests: {
        include: { tag: { select: { id: true, name: true } } }
    },
    courseAttempts: {
        where: { status: "ENROLLED" },
        select: {
            course: { select: { code: true, name: true } },
            class: {
                select: {
                    code: true,
                    classSchedules: {
                        select: {
                            id: true,
                            dayOfWeek: true,
                            start: true,
                            end: true,
                            room: { select: { code: true } }
                        }
                    }
                }
            }
        }
    },
    program: { select: { code: true, name: true } },
    specialization: { select: { code: true, name: true } }
} as const;

export type SelectedPerson = {
    id: number;
    publicId: string;
    name: string;
    avatarMediaId: string | null;
    publicProfileEnabled: boolean;
    publicDisplayName: string | null;
    publicBio: string | null;
    currentCoursesVisibility: "PRIVATE" | "FRIENDS" | "PUBLIC";
    entryYear: number | null;
    tagInterests: Array<{ tag: { id: number; name: string } }>;
    courseAttempts: Array<{
        course: { code: string; name: string };
        class: {
            code: string;
            classSchedules: Array<{
                id: number;
                dayOfWeek:
                    | "MONDAY"
                    | "TUESDAY"
                    | "WEDNESDAY"
                    | "THURSDAY"
                    | "FRIDAY"
                    | "SATURDAY"
                    | "SUNDAY";
                start: string;
                end: string;
                room: { code: string };
            }>;
        } | null;
    }>;
    program: { code: number; name: string } | null;
    specialization: { code: string; name: string } | null;
};
