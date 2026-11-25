import assert from "node:assert/strict";
import test from "node:test";
import { classifyIdentity } from "../src/identity.js";
import { localIdentityDatabaseUrl } from "../src/identityBackfill.js";

test("classifies humans and services without inferring a mixed identity", () => {
    assert.equal(
        classifyIdentity([{ role: "STUDENT" }, { role: "ADMIN" }]),
        "HUMAN"
    );
    assert.equal(classifyIdentity([{ role: "BOT" }]), "SERVICE");
    assert.throws(
        () => classifyIdentity([{ role: "BOT" }, { role: "ADMIN" }]),
        /explicit classification/
    );
});

test("requires an explicit local test database and rejects the homologation tunnel", () => {
    assert.throws(() => localIdentityDatabaseUrl(undefined), /never used/);
    for (const url of [
        "postgresql://localhost:5433/pomi_test",
        "postgresql://example.com/pomi_test",
        "postgresql://localhost/pomi",
        "postgresql://localhost/pomi_test?host=example.com",
        "postgresql://localhost/pomi_test#fragment"
    ])
        assert.throws(() => localIdentityDatabaseUrl(url), /local/);
    assert.equal(
        localIdentityDatabaseUrl("postgresql://localhost:55439/pomi_test"),
        "postgresql://localhost:55439/pomi_test"
    );
});

test("backfill refuses ambiguous kinds and unapproved student sharing before writes", async () => {
    const { planIdentityBackfill } = await import("../src/identityBackfill.js");
    type Account = Parameters<typeof planIdentityBackfill>[0][number];
    const account = (
        id: number,
        studentId: number | null,
        roles: Account["roles"] = []
    ): Account => ({
        id,
        issuer: "https://fixture.invalid",
        subject: String(id),
        email: null,
        displayName: null,
        studentId,
        status: "ACTIVE",
        createdAt: new Date(0),
        updatedAt: new Date(0),
        roles,
        authIdentity: null
    });
    assert.throws(
        () => planIdentityBackfill([account(1, 7), account(2, 7)], []),
        /explicit identity mapping/
    );
    const mixed = account(3, null, [
        { authUserId: 3, role: "BOT" },
        { authUserId: 3, role: "ADMIN" }
    ]);
    assert.throws(
        () => planIdentityBackfill([mixed], []),
        /explicit classification/
    );
    assert.equal(
        planIdentityBackfill(
            [mixed],
            [
                {
                    canonicalAuthUserId: 3,
                    authUserIds: [3],
                    kind: "HUMAN",
                    expectedIdentities: [
                        {
                            id: 3,
                            issuer: mixed.issuer,
                            subject: mixed.subject,
                            studentId: null
                        }
                    ]
                }
            ]
        )[0].kind,
        "HUMAN"
    );
});
