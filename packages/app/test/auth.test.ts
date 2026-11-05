import type { resolvePrincipal as ResolvePrincipal } from "#/auth.js";
import type { Request, Response } from "express";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";

let server: http.Server;
let privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
let issuer: string;
let verifyAccessToken: (token: string) => Promise<unknown>;
let resolvePrincipal: typeof ResolvePrincipal;

before(async () => {
    const keys = await generateKeyPair("RS256", { extractable: true });
    privateKey = keys.privateKey;
    const publicJwk = await exportJWK(keys.publicKey);
    Object.assign(publicJwk, { alg: "RS256", kid: "pomi-test", use: "sig" });

    server = http.createServer((_request, response) => {
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ keys: [publicJwk] }));
    });
    await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve)
    );
    const address = server.address();
    if (!address || typeof address === "string") {
        throw new Error("JWKS test server did not start.");
    }

    issuer = `http://127.0.0.1:${address.port}/realms/pomi`;
    process.env.DISABLED_AUTH = "false";
    process.env.KEYCLOAK_ISSUER = issuer;
    process.env.KEYCLOAK_AUDIENCE = "pomi-api";
    ({ resolvePrincipal, verifyAccessToken } = await import("#/auth.js"));
});

after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
    );
});

async function signToken(overrides: Record<string, unknown> = {}) {
    const token = new SignJWT({ ...overrides })
        .setProtectedHeader({ alg: "RS256", kid: "pomi-test" })
        .setIssuer(issuer)
        .setAudience("pomi-api")
        .setSubject("keycloak-user")
        .setIssuedAt()
        .setExpirationTime("5m");
    return token.sign(privateKey);
}

function credentialFixture(overrides: Record<string, unknown> = {}) {
    return {
        id: 80,
        legacyId: 8,
        issuer,
        subject: "keycloak-user",
        email: "s195440@dac.unicamp.br",
        displayName: "Samuel Rodrigues Ferreira",
        status: "ACTIVE",
        legacyStudentId: overrides.studentId ?? null,
        principal: {
            id: 800,
            kind: "HUMAN",
            status: "ACTIVE",
            user: { id: 8000, studentId: overrides.studentId ?? null },
            serviceAccount: null
        },
        roles: [{ authIdentityId: 80, role: "STUDENT" }],
        capabilities: [],
        ...overrides
    };
}

function requestWithPrisma(prisma: object) {
    return { prisma } as Request;
}

test("accepts a valid Keycloak access token", async () => {
    const payload = (await verifyAccessToken(await signToken())) as {
        sub?: string;
    };
    assert.equal(payload.sub, "keycloak-user");
});

test("resolves optional media authentication only when a bearer is present", async () => {
    const { AuthRegistry, policies } = await import("#/auth.js");
    const registry = new AuthRegistry();
    registry.addPolicy(
        "GET",
        "/media/:mediaId/:variant",
        policies.optionalAuth
    );
    const values: unknown[] = [];
    const response = {
        status(value: number) {
            values.push(value);
            return this;
        },
        type() {
            return this;
        },
        json(value: unknown) {
            values.push(value);
            return this;
        }
    } as unknown as Response;
    const makeRequest = (authorization?: string) =>
        ({
            method: "GET",
            path: "/media/id/avatarSmall",
            headers: authorization ? { authorization } : {},
            prisma: {
                authIdentity: { findUnique: async () => credentialFixture() }
            },
            scope: { register: () => undefined }
        }) as unknown as Request;
    let nextCount = 0;
    const next = () => {
        nextCount += 1;
    };

    await registry.middleware()(makeRequest(), response, next);
    assert.equal(nextCount, 1);
    await registry.middleware()(makeRequest("Bearer invalid"), response, next);
    assert.equal(nextCount, 1);
    assert.equal(values[0], 401);
    const authenticated = makeRequest(`Bearer ${await signToken()}`);
    await registry.middleware()(authenticated, response, next);
    assert.equal(nextCount, 2);
    assert.equal(authenticated.principal?.authIdentityId, 80);
});

test("rejects a token for another audience", async () => {
    const token = await new SignJWT({})
        .setProtectedHeader({ alg: "RS256", kid: "pomi-test" })
        .setIssuer(issuer)
        .setAudience("another-api")
        .setSubject("keycloak-user")
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);
    await assert.rejects(verifyAccessToken(token));
});

test("rejects a token for another issuer", async () => {
    const token = await new SignJWT({})
        .setProtectedHeader({ alg: "RS256", kid: "pomi-test" })
        .setIssuer("https://issuer.invalid/realms/pomi")
        .setAudience("pomi-api")
        .setSubject("keycloak-user")
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);
    await assert.rejects(verifyAccessToken(token));
});

test("rejects an expired token", async () => {
    const token = await new SignJWT({})
        .setProtectedHeader({ alg: "RS256", kid: "pomi-test" })
        .setIssuer(issuer)
        .setAudience("pomi-api")
        .setSubject("keycloak-user")
        .setIssuedAt()
        .setExpirationTime(0)
        .sign(privateKey);
    await assert.rejects(verifyAccessToken(token));
});

test("rejects a token without a subject", async () => {
    const token = await new SignJWT({})
        .setProtectedHeader({ alg: "RS256", kid: "pomi-test" })
        .setIssuer(issuer)
        .setAudience("pomi-api")
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);
    await assert.rejects(verifyAccessToken(token));
});

test("authentication reads a known identity without provisioning academic data", async () => {
    let reads = 0;
    const principal = await resolvePrincipal(
        { iss: issuer, sub: "keycloak-user", email: "s195440@dac.unicamp.br" },
        requestWithPrisma({
            authIdentity: {
                findUnique: async () => {
                    reads++;
                    return credentialFixture();
                }
            }
        })
    );
    assert.equal(reads, 1);
    assert.equal(principal.userId, 8000);
    assert.equal(principal.studentId, null);
});

test("authentication takes the academic link from User and leaves token metadata unchanged", async () => {
    const record = credentialFixture({
        legacyStudentId: null,
        principal: {
            id: 800,
            kind: "HUMAN",
            status: "ACTIVE",
            user: { id: 8000, studentId: 77 },
            serviceAccount: null
        }
    });
    const principal = await resolvePrincipal(
        {
            iss: issuer,
            sub: "keycloak-user",
            email: "another@example.test",
            name: "Changed"
        },
        requestWithPrisma({ authIdentity: { findUnique: async () => record } })
    );
    assert.equal(principal.studentId, 77);
    assert.equal(principal.email, "s195440@dac.unicamp.br");
    assert.equal(record.displayName, "Samuel Rodrigues Ferreira");
});

test("unknown credentials are rejected without a write or academic claim", async () => {
    await assert.rejects(
        resolvePrincipal(
            { iss: issuer, sub: "unknown", email: "s195440@dac.unicamp.br" },
            requestWithPrisma({
                authIdentity: { findUnique: async () => null }
            })
        ),
        /Forbidden/
    );
});

test("does not provision a disabled identity", async () => {
    let transactionStarted = false;
    const prisma = {
        authIdentity: {
            findUnique: async () => credentialFixture({ status: "DISABLED" })
        },
        $transaction: async () => {
            transactionStarted = true;
        }
    };

    await assert.rejects(
        resolvePrincipal(
            {
                iss: issuer,
                sub: "keycloak-user",
                email: "s195440@dac.unicamp.br"
            },
            requestWithPrisma(prisma)
        ),
        /Forbidden/
    );
    assert.equal(transactionStarted, false);
});

test("fails closed when an existing legacy account has no canonical identity", async () => {
    await assert.rejects(
        resolvePrincipal(
            { iss: issuer, sub: "keycloak-user" },
            requestWithPrisma({
                authIdentity: {
                    findUnique: async () =>
                        credentialFixture({ principal: null })
                }
            })
        ),
        /Canonical identity/
    );
});

test("rejects a disabled canonical principal even when the legacy account is active", async () => {
    const account = credentialFixture();
    account.principal.status = "DISABLED";
    await assert.rejects(
        resolvePrincipal(
            { iss: issuer, sub: "keycloak-user" },
            requestWithPrisma({
                authIdentity: { findUnique: async () => account }
            })
        ),
        /Forbidden/
    );
});

test("exposes canonical identity identifiers in current-user", async () => {
    const { createCurrentUserService } =
        await import("#/modules/identity/current-user/CurrentUser.service.js");
    const principal = await resolvePrincipal(
        { iss: issuer, sub: "keycloak-user" },
        requestWithPrisma({
            authIdentity: {
                findUnique: async () => credentialFixture({ studentId: 21 })
            }
        })
    );
    assert.equal(principal.principalId, 800);
    assert.equal(principal.userId, 8000);
    assert.deepEqual(createCurrentUserService().get(principal), {
        principalId: principal.principalId,
        authIdentityId: principal.authIdentityId,
        kind: "HUMAN",
        userId: principal.userId,
        serviceAccountId: null,
        roles: [...principal.roles],
        capabilities: [...principal.capabilities],
        studentId: principal.studentId
    });
});
