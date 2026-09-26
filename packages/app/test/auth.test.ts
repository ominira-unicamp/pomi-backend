import type { Request } from "express";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";

let server: http.Server;
let privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
let issuer: string;
let verifyAccessToken: (token: string) => Promise<unknown>;
let resolvePrincipal: (typeof import("#/auth.js"))["resolvePrincipal"];

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

function authUser(overrides: Record<string, unknown> = {}) {
    return {
        id: 8,
        issuer,
        subject: "keycloak-user",
        email: "s195440@dac.unicamp.br",
        displayName: "Samuel Rodrigues Ferreira",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
        studentId: null,
        roles: [{ authUserId: 8, role: "STUDENT" }],
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

test("creates and links a student for an existing unlinked student identity", async () => {
    const upserts: unknown[] = [];
    const transactionClient = {
        student: {
            upsert: async (input: unknown) => {
                upserts.push(input);
                return { id: 12 };
            }
        },
        authUser: {
            updateMany: async () => ({ count: 1 }),
            findUnique: async () => ({ studentId: 12 })
        }
    };
    const prisma = {
        authUser: { findUnique: async () => authUser() },
        $transaction: async (
            operation: (tx: typeof transactionClient) => Promise<unknown>
        ) => operation(transactionClient)
    };

    const principal = await resolvePrincipal(
        {
            iss: issuer,
            sub: "keycloak-user",
            email: "s195440@dac.unicamp.br",
            name: "Samuel Rodrigues Ferreira"
        },
        requestWithPrisma(prisma)
    );

    assert.equal(principal.studentId, 12);
    assert.deepEqual(upserts, [
        {
            where: { ra: "195440" },
            update: {},
            create: { ra: "195440", name: "Samuel Rodrigues Ferreira" },
            select: { id: true }
        }
    ]);
});

test("keeps an existing student link without starting a transaction", async () => {
    let transactionStarted = false;
    const prisma = {
        authUser: {
            findUnique: async () => authUser({ studentId: 21 })
        },
        $transaction: async () => {
            transactionStarted = true;
        }
    };

    const principal = await resolvePrincipal(
        {
            iss: issuer,
            sub: "keycloak-user",
            email: "s195440@dac.unicamp.br"
        },
        requestWithPrisma(prisma)
    );

    assert.equal(principal.studentId, 21);
    assert.equal(transactionStarted, false);
});

test("leaves explicit student registration to the registration endpoint", async () => {
    let transactionStarted = false;
    const prisma = {
        authUser: { findUnique: async () => authUser() },
        $transaction: async () => {
            transactionStarted = true;
        }
    };

    const principal = await resolvePrincipal(
        {
            iss: issuer,
            sub: "keycloak-user",
            email: "s195440@dac.unicamp.br"
        },
        requestWithPrisma(prisma),
        { provisionStudent: false }
    );

    assert.equal(principal.studentId, null);
    assert.equal(transactionStarted, false);
});

test("preserves a link written by a concurrent request", async () => {
    const transactionClient = {
        student: { upsert: async () => ({ id: 12 }) },
        authUser: {
            updateMany: async () => ({ count: 0 }),
            findUnique: async () => ({ studentId: 23 })
        }
    };
    const prisma = {
        authUser: { findUnique: async () => authUser() },
        $transaction: async (
            operation: (tx: typeof transactionClient) => Promise<unknown>
        ) => operation(transactionClient)
    };

    const principal = await resolvePrincipal(
        {
            iss: issuer,
            sub: "keycloak-user",
            email: "s195440@dac.unicamp.br"
        },
        requestWithPrisma(prisma)
    );

    assert.equal(principal.studentId, 23);
});

test("uses the username when the token has no display name", async () => {
    let createdName: string | undefined;
    const transactionClient = {
        student: {
            upsert: async (input: { create: { name: string } }) => {
                createdName = input.create.name;
                return { id: 12 };
            }
        },
        authUser: {
            updateMany: async () => ({ count: 1 }),
            findUnique: async () => ({ studentId: 12 })
        }
    };
    const prisma = {
        authUser: { findUnique: async () => authUser() },
        $transaction: async (
            operation: (tx: typeof transactionClient) => Promise<unknown>
        ) => operation(transactionClient)
    };

    await resolvePrincipal(
        {
            iss: issuer,
            sub: "keycloak-user",
            email: "s195440@dac.unicamp.br",
            preferred_username: "s195440"
        },
        requestWithPrisma(prisma)
    );

    assert.equal(createdName, "s195440");
});

test("does not provision a disabled identity", async () => {
    let transactionStarted = false;
    const prisma = {
        authUser: {
            findUnique: async () => authUser({ status: "DISABLED" })
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
