import { createSocialProfileService } from "#/modules/social/profile/SocialProfile.service.js";
import assert from "node:assert/strict";
import test from "node:test";
import { socialPerson } from "./fixtures/social.js";

test("social profile reads and updates the own profile without losing absent fields", async () => {
    const student = socialPerson();
    let update: unknown;
    const service = createSocialProfileService({
        prisma: {
            student: {
                findUnique: async () => student,
                update: async (input: { data: unknown }) => {
                    update = input.data;
                    return { ...student, publicBio: "Bio" };
                }
            }
        }
    } as never);
    const profile = (await service.getProfile(student.id))._unsafeUnwrap();
    assert.equal(profile.displayName, student.name);
    assert.equal(profile.enabled, true);
    const updated = (
        await service.updateProfile(student.id, { bio: "Bio" })
    )._unsafeUnwrap();
    assert.equal(updated.bio, "Bio");
    assert.deepEqual(update, {
        publicProfileEnabled: undefined,
        publicDisplayName: undefined,
        publicBio: "Bio",
        currentCoursesVisibility: undefined
    });
});

test("social profile returns not found before updating an unknown student", async () => {
    const service = createSocialProfileService({
        prisma: { student: { findUnique: async () => null } }
    } as never);
    assert.equal((await service.getProfile(8)).isErr(), true);
    assert.equal(
        (await service.updateProfile(8, { enabled: true })).isErr(),
        true
    );
});
