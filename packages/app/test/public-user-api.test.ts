import { exportJWK, generateKeyPair, SignJWT } from "jose";
import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

test("canonical user HTTP keeps its target and effects for authorized human, administrator and bot", async () => {
    const keys = await generateKeyPair("RS256", { extractable: true });
    const jwk = {
        ...(await exportJWK(keys.publicKey)),
        kid: "public-user-test",
        alg: "RS256",
        use: "sig"
    };
    const jwks = http.createServer((_request, response) => {
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ keys: [jwk] }));
    });
    await new Promise<void>((resolve) => jwks.listen(0, "127.0.0.1", resolve));
    const address = jwks.address();
    assert.ok(address && typeof address !== "string");
    const issuer = `http://127.0.0.1:${address.port}/realms/pomi`;
    process.env.DISABLED_AUTH = "false";
    process.env.NODE_ENV = "test";
    process.env.KEYCLOAK_ISSUER = issuer;
    process.env.KEYCLOAK_AUDIENCE = "pomi-api";
    const [
        { createAppContainer, appScopeMiddleware },
        { loadAppConfig },
        { appControllers },
        { errorHandler },
        { default: express }
    ] = await Promise.all([
        import("#/Container.js"),
        import("#/Config.js"),
        import("#/Controllers.js"),
        import("@pomi/api-core"),
        import("express")
    ]);
    const target = {
        id: 117,
        principalId: 17,
        name: "Initial",
        studentId: null,
        favoriteCurriculumId: null
    };
    let writes = 0;
    let blocked = false;
    const identities = [
        { id: 71, subject: "owner", role: "STUDENT", userId: 117 },
        { id: 72, subject: "other", role: "STUDENT", userId: 118 },
        { id: 73, subject: "admin", role: "ADMIN", userId: 119 },
        { id: 74, subject: "bot", role: "BOT", userId: null }
    ].map((identity) => ({
        ...identity,
        issuer,
        email: `${identity.subject}@example.test`,
        status: "ACTIVE",
        roles: [{ role: identity.role }],
        capabilities: [],
        principal: {
            id: identity.userId === 117 ? 17 : identity.id,
            status: "ACTIVE",
            kind: identity.userId === null ? "SERVICE" : "HUMAN",
            user:
                identity.userId === null
                    ? null
                    : { id: identity.userId, studentId: null },
            serviceAccount: identity.userId === null ? { id: 18 } : null
        }
    }));
    const project = (
        value: Record<string, unknown>,
        select?: Record<string, unknown>
    ) =>
        select
            ? Object.fromEntries(
                  Object.keys(select).map((key) => [key, value[key]])
              )
            : value;
    const prisma = {
        authIdentity: {
            findUnique: async ({
                where
            }: {
                where: { id?: number; issuer_subject?: { subject: string } };
            }) => {
                const identity = identities.find((value) =>
                    where.id !== undefined
                        ? value.id === where.id
                        : value.subject === where.issuer_subject?.subject
                );
                return identity
                    ? {
                          ...identity,
                          status:
                              blocked && identity.subject === "owner"
                                  ? "DISABLED"
                                  : "ACTIVE"
                      }
                    : null;
            }
        },
        user: {
            findUnique: async ({
                where,
                select
            }: {
                where: { id: number };
                select?: Record<string, unknown>;
            }) => (where.id === target.id ? project(target, select) : null),
            update: async ({
                where,
                data,
                select
            }: {
                where: { id: number };
                data: Partial<typeof target>;
                select?: Record<string, unknown>;
            }) => {
                assert.equal(where.id, target.id);
                writes++;
                Object.assign(target, data);
                return project(target, select);
            }
        },
        studentCourseAttempt: {
            count: async () => 0,
            findMany: async () => []
        },
        botGrant: {
            count: async () => 0,
            findFirst: async ({
                where
            }: {
                where: {
                    userId: number;
                    botAuthIdentityId: number;
                    capability: string;
                };
            }) =>
                where.userId === target.id &&
                where.botAuthIdentityId === 74 &&
                ["USER_PROFILE_READ", "USER_PROFILE_WRITE"].includes(
                    where.capability
                )
                    ? { id: 1 }
                    : null,
            findMany: async () => []
        }
    };
    const container = createAppContainer(
        loadAppConfig({
            DATABASE_URL:
                "postgresql://unused@127.0.0.1:55445/public_user_test",
            NODE_ENV: "test",
            DISABLED_AUTH: "false",
            KEYCLOAK_ISSUER: issuer,
            KEYCLOAK_AUDIENCE: "pomi-api"
        }),
        prisma as never
    );
    const app = express();
    app.use(express.json());
    app.use(appScopeMiddleware(container));
    app.use(appControllers.authRegistry.middleware());
    app.use(appControllers.router);
    app.use(errorHandler);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const endpoint = server.address();
    assert.ok(endpoint && typeof endpoint !== "string");
    const token = (subject: string) =>
        new SignJWT({ email: "s123456@dac.unicamp.br" })
            .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
            .setIssuer(issuer)
            .setAudience("pomi-api")
            .setSubject(subject)
            .setIssuedAt()
            .setExpirationTime("5m")
            .sign(keys.privateKey);
    const call = async (
        subject: string,
        path: string,
        body?: unknown,
        method = body ? "PATCH" : "GET"
    ) =>
        fetch(`http://127.0.0.1:${endpoint.port}${path}`, {
            method,
            headers: {
                "Authorization": `Bearer ${await token(subject)}`,
                "Content-Type": "application/json"
            },
            ...(body ? { body: JSON.stringify(body) } : {})
        });
    try {
        const reads = await Promise.all(
            ["owner", "admin", "bot"].map(async (subject) => {
                const response = await call(subject, "/users/117");
                assert.equal(response.status, 200);
                return response.json();
            })
        );
        assert.deepEqual(reads[0], reads[1]);
        assert.deepEqual(reads[0], reads[2]);
        assert.equal(writes, 0);
        const changed = [];
        for (const subject of ["owner", "admin", "bot"]) {
            target.name = "Initial";
            const response = await call(subject, "/users/117", {
                name: "Explicit target"
            });
            assert.equal(response.status, 200);
            changed.push(await response.json());
        }
        assert.deepEqual(changed[0], changed[1]);
        assert.deepEqual(changed[0], changed[2]);
        assert.equal(writes, 3);
        assert.equal(
            (await call("other", "/users/117", { name: "Forbidden" })).status,
            403
        );
        assert.equal(target.name, "Explicit target");
        assert.equal(writes, 3);
        assert.equal((await call("bot", "/users/118")).status, 403);
        assert.equal((await call("bot", "/users/117/bot-grants")).status, 403);
        assert.equal(
            (await call("owner", "/users/117/bot-grants")).status,
            200
        );
        assert.equal(
            (await call("owner", "/users/117/course-attempts")).status,
            200
        );
        const me = (await (await call("owner", "/me")).json()) as Record<
            string,
            unknown
        >;
        assert.equal(me.userId, 117);
        assert.equal(me.authIdentityId, 71);
        assert.equal(me.principalId, 17);
        assert.equal(me.studentId, null);
        assert.equal("id" in me, false);
        assert.equal((await call("unknown", "/me")).status, 403);
        assert.equal(writes, 3);
        assert.equal(
            (await call("owner", "/student/117/curricula")).status,
            404
        );
        assert.equal((await call("owner", "/me/bot-grants")).status, 404);
        assert.equal(
            (
                await call("bot", "/users/117/preferences", {
                    favoriteCurriculumId: null
                })
            ).status,
            403
        );
        assert.equal(
            (
                await call(
                    "admin",
                    "/users/117/bot-grants/74",
                    { capabilities: [], authorAuthIdentityId: 71 },
                    "PUT"
                )
            ).status,
            403
        );
        assert.equal(writes, 3);
        blocked = true;
        assert.equal((await call("owner", "/users/117")).status, 403);
    } finally {
        server.closeAllConnections();
        jwks.closeAllConnections();
        await Promise.all([
            new Promise<void>((resolve) => server.close(() => resolve())),
            new Promise<void>((resolve) => jwks.close(() => resolve()))
        ]);
        await container.dispose();
    }
});
