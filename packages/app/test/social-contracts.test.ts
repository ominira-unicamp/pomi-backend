import assert from "node:assert/strict";
import test from "node:test";

process.env.DISABLED_AUTH = "true";

async function loadContracts() {
    const [{ default: profile }, { default: people }, { default: friendship }] =
        await Promise.all([
            import("#/modules/social/profile/SocialProfile.contract.js"),
            import("#/modules/social/people/SocialPeople.contract.js"),
            import("#/modules/social/friendship/SocialFriendship.contract.js")
        ]);
    return { default: { ...profile, ...people, ...friendship } };
}

test("student social contracts protect reads and writes with social capabilities", async () => {
    const [{ default: contracts }, { UserCapabilities }] = await Promise.all([
        loadContracts(),
        import("#/Authorization.js")
    ]);

    assert.deepEqual(contracts.getProfile.meta.authorization, {
        kind: "user-access",
        userParam: "userId",
        capability: UserCapabilities.SOCIAL_READ
    });
    assert.deepEqual(contracts.createFriendship.meta.authorization, {
        kind: "user-access",
        userParam: "userId",
        capability: UserCapabilities.SOCIAL_WRITE
    });
});

test("student social input allows directory listings and validates public ids", async () => {
    const { default: contracts } = await loadContracts();

    assert.equal(
        contracts.listPeople.request.safeParse({
            path: { userId: "1" },
            query: {}
        }).success,
        true
    );
    assert.equal(
        contracts.listPeople.request.safeParse({
            path: { userId: "1" },
            query: { query: "ab" }
        }).success,
        true
    );
    assert.equal(
        contracts.createFriendship.request.safeParse({
            path: { userId: "1" },
            body: { targetPublicId: "not-a-uuid" }
        }).success,
        false
    );
    assert.equal(
        contracts.updateProfile.request.safeParse({
            path: { userId: "1" },
            body: {
                enabled: true,
                currentCoursesVisibility: "FRIENDS"
            }
        }).success,
        true
    );
    assert.equal(
        contracts.updateProfile.request.safeParse({
            path: { userId: "1" },
            body: { showProgram: true }
        }).success,
        false
    );
});
