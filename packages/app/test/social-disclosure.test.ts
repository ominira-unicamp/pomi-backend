import {
    buildPerson,
    decidePersonDisclosure
} from "#/modules/social/SocialPerson.presenter.js";
import type { SelectedPerson } from "#/modules/social/SocialPerson.queries.js";
import assert from "node:assert/strict";
import test from "node:test";

test("person disclosure preserves the independent profile and course visibility matrix", () => {
    for (const profileEnabled of [false, true])
        for (const forceMinimal of [false, true])
            for (const isOwner of [false, true])
                for (const acceptedFriend of [false, true])
                    for (const currentCoursesVisibility of [
                        "PRIVATE",
                        "FRIENDS",
                        "PUBLIC"
                    ] as const) {
                        const disclosure = decidePersonDisclosure({
                            profileEnabled,
                            forceMinimal,
                            isOwner,
                            acceptedFriend,
                            currentCoursesVisibility
                        });
                        assert.deepEqual(disclosure, {
                            showProfile: profileEnabled && !forceMinimal,
                            showCurrentCourses:
                                !forceMinimal &&
                                (isOwner ||
                                    currentCoursesVisibility === "PUBLIC" ||
                                    (currentCoursesVisibility === "FRIENDS" &&
                                        acceptedFriend))
                        });
                    }
});

test("person projection uses the named disclosure for profile fields and courses independently", () => {
    const student = {
        id: 1,
        publicId: "person",
        name: "Nome",
        publicDisplayName: null,
        avatarMediaId: "avatar",
        publicBio: "Bio",
        program: { id: 2 },
        specialization: null,
        entryYear: 2026,
        tagInterests: [{ tag: { id: 3, name: "Tag" } }],
        courseAttempts: [
            { course: { code: "MC102", name: "Algoritmos" }, class: null }
        ]
    } as unknown as SelectedPerson;
    const minimum = buildPerson(student, {
        showProfile: false,
        showCurrentCourses: false
    });
    assert.equal(minimum.displayName, "Nome");
    assert.equal(minimum.avatarMediaId, null);
    assert.equal(minimum.bio, null);
    assert.equal(minimum.program, null);
    assert.equal(minimum.entryYear, null);
    assert.deepEqual(minimum.interests, []);
    assert.deepEqual(minimum.currentCourses, []);
    const courses = buildPerson(student, {
        showProfile: false,
        showCurrentCourses: true
    });
    assert.equal(courses.bio, null);
    assert.equal(courses.currentCourses[0]?.courseCode, "MC102");
    const profile = buildPerson(student, {
        showProfile: true,
        showCurrentCourses: false
    });
    assert.equal(profile.avatarMediaId, "avatar");
    assert.deepEqual(profile.interests, [{ id: 3, name: "Tag" }]);
    assert.deepEqual(profile.currentCourses, []);
});
