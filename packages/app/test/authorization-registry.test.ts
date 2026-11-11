import assert from "node:assert/strict";
import test from "node:test";

process.env.DISABLED_AUTH = "true";
test("keeps public, user and capability policies distinct", async () => {
    const { AuthRegistry, Capabilities, policies, UserCapabilities } =
        await import("#/auth.js");
    const registry = new AuthRegistry();
    registry.addException("GET", "/courses");
    registry.addPolicy(
        "GET",
        "/users/:userId/courses",
        policies.userAccess("userId", UserCapabilities.HISTORY_READ)
    );
    registry.addPolicy(
        "POST",
        "/courses",
        policies.capability(Capabilities.ACADEMIC_WRITE)
    );

    assert.equal(registry.checkException("GET", "/courses"), true);
    assert.equal(registry.checkException("GET", "/users/42/courses"), false);
    const studentRule = registry.findRule("GET", "/users/42/courses");
    assert.equal(studentRule?.rule.policy.kind, "user-access");
    assert.equal(studentRule?.rule.path, "/users/:userId/courses");
    assert.equal(studentRule?.params.userId, "42");
    assert.equal(
        registry.findRule("POST", "/courses")?.rule.policy.kind,
        "capability"
    );
});

test("bot grants accept user capabilities and reject retired student labels", async () => {
    const { default: grants } =
        await import("#/modules/identity/bot-grant/BotGrant.contract.js");
    assert.equal(
        grants.schemas.replaceBody.safeParse({
            capabilities: ["USER_PROFILE_READ"],
            authorAuthIdentityId: 9
        }).success,
        true
    );
    assert.equal(
        grants.schemas.replaceBody.safeParse({
            capabilities: ["STUDENT_PROFILE_READ"],
            authorAuthIdentityId: 9
        }).success,
        false
    );
});
