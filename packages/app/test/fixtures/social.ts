export function socialPerson(id = 8) {
    return {
        id,
        publicId: "a375fdb0-45d9-4a79-8415-89fcb64157b6",
        name: "Ada Lovelace",
        avatarMediaId: null,
        publicProfileEnabled: true,
        publicDisplayName: null,
        publicBio: null,
        currentCoursesVisibility: "FRIENDS" as "PRIVATE" | "FRIENDS" | "PUBLIC",
        student: {
            name: "Ada Lovelace",
            entryYear: 2026,
            program: null,
            specialization: null
        },
        tagInterests: [],
        courseAttempts: []
    };
}
