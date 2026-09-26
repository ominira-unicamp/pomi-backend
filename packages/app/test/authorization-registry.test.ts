import assert from "node:assert/strict";
import test from "node:test";

process.env.DISABLED_AUTH = "true";

test("keeps public, student and capability policies distinct", async () => {
    const { AuthRegistry, Capabilities, policies, StudentCapabilities } =
        await import("#/auth.js");
    const registry = new AuthRegistry();
    registry.addException("GET", "/courses");
    registry.addPolicy(
        "GET",
        "/student/:sid/courses",
        policies.studentAccess("sid", StudentCapabilities.HISTORY_READ)
    );
    registry.addPolicy(
        "POST",
        "/courses",
        policies.capability(Capabilities.ACADEMIC_WRITE)
    );

    assert.equal(registry.checkException("GET", "/courses"), true);
    assert.equal(registry.checkException("GET", "/student/42/courses"), false);
    const studentRule = registry.findRule("GET", "/student/42/courses");
    assert.equal(studentRule?.rule.policy.kind, "student-access");
    assert.equal(studentRule?.rule.path, "/student/:sid/courses");
    assert.equal(studentRule?.params.sid, "42");
    assert.equal(
        registry.findRule("POST", "/courses")?.rule.policy.kind,
        "capability"
    );
});
