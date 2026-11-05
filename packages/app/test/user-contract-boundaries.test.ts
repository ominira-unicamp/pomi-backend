import assert from "node:assert/strict";
import test from "node:test";

process.env.DISABLED_AUTH = "true";

test("all canonical person routes declare an explicit user path and retired aliases are absent", async () => {
    const { generateAppOpenApiDocument } = await import("#/OpenApi.js");
    const document = generateAppOpenApiDocument();
    const paths = document.paths ?? {};
    assert.ok(paths["/users/{userId}"]);
    assert.ok(paths["/users/{userId}/profile"]);
    assert.ok(paths["/users/{userId}/student"]);
    assert.ok(
        paths["/users/{userId}/student/course-attempts/{attemptId}/absences"]
    );
    assert.ok(paths["/admin/auth-identities"]);
    for (const [path, item] of Object.entries(paths)) {
        assert.equal(path.startsWith("/student/"), false, path);
        assert.equal(path.startsWith("/students"), false, path);
        assert.equal(path.startsWith("/me/"), false, path);
        assert.equal(path.startsWith("/admin/auth-users"), false, path);
        if (!path.startsWith("/users/")) continue;
        assert.ok(path.startsWith("/users/{userId}"), path);
        for (const method of [
            "get",
            "post",
            "put",
            "patch",
            "delete"
        ] as const) {
            const operation = item?.[method];
            if (!operation) continue;
            const parameter = operation.parameters?.find(
                (value) => "name" in value && value.name === "userId"
            );
            assert.ok(
                parameter && "required" in parameter && parameter.required,
                `${method} ${path}`
            );
            assert.ok(
                !operation.parameters?.some(
                    (value) =>
                        "name" in value &&
                        ["sid", "studentId", "authUserId"].includes(value.name)
                )
            );
        }
    }
});

test("grant and account management contracts require explicit business inputs", async () => {
    const [{ default: grants }, { default: identities }, { default: student }] =
        await Promise.all([
            import("#/modules/identity/bot-grant/BotGrant.contract.js"),
            import("#/modules/identity/auth-identity/AuthIdentity.contract.js"),
            import("#/modules/student/Student.contract.js")
        ]);
    assert.equal(
        grants.replace.request.safeParse({
            path: { userId: "117", botAuthIdentityId: "74" },
            body: { capabilities: [] }
        }).success,
        false
    );
    assert.equal(
        grants.replace.request.safeParse({
            path: { userId: "117", botAuthIdentityId: "74" },
            body: { capabilities: [], authorAuthIdentityId: 71 }
        }).success,
        true
    );
    assert.equal(
        identities.create.request.safeParse({
            body: { subject: "bot", displayName: "Bot" }
        }).success,
        false
    );
    assert.equal(
        identities.create.request.safeParse({
            body: {
                issuer: "https://issuer.example.test",
                subject: "bot",
                displayName: "Bot"
            }
        }).success,
        true
    );
    assert.equal(
        student.create.request.safeParse({
            path: { userId: "117" },
            body: { name: "Academic name" }
        }).success,
        false
    );
    assert.equal(
        student.create.request.safeParse({
            path: { userId: "117" },
            body: { name: "Academic name", ra: "123456" }
        }).success,
        true
    );
});
