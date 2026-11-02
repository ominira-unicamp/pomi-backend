import { createCanonicalIdentity, createDatabaseClient } from "@pomi/db";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import http from "node:http";
import test from "node:test";

const databaseUrl = process.env.POMI_USER_API_TEST_DATABASE_URL;
function jsonObject(value: unknown): Record<string, unknown> {
    assert.ok(
        value !== null && typeof value === "object" && !Array.isArray(value)
    );
    return value as Record<string, unknown>;
}

test(
    "legacy HTTP targets canonical users without leaking user ids and academic removal preserves personal resources",
    {
        skip: !databaseUrl,
        timeout: 90000
    },
    async () => {
        const database = new URL(databaseUrl!);
        assert.ok(
            ["localhost", "127.0.0.1", "[::1]"].includes(database.hostname)
        );
        assert.ok(database.pathname.endsWith("_test"));
        assert.notEqual(database.port, "5433");
        const prisma = createDatabaseClient(databaseUrl!);
        const keys = await generateKeyPair("RS256");
        const jwk = {
            ...(await exportJWK(keys.publicKey)),
            alg: "RS256",
            kid: "user-ownership-test",
            use: "sig"
        };
        const jwks = http.createServer((_request, response) => {
            response.setHeader("Content-Type", "application/json");
            response.end(JSON.stringify({ keys: [jwk] }));
        });
        await new Promise<void>((resolve) =>
            jwks.listen(0, "127.0.0.1", resolve)
        );
        const jwksAddress = jwks.address();
        assert.ok(jwksAddress && typeof jwksAddress !== "string");
        const issuer = `http://127.0.0.1:${jwksAddress.port}/realms/pomi`;
        process.env.DISABLED_AUTH = "false";
        process.env.NODE_ENV = "test";
        process.env.KEYCLOAK_ISSUER = issuer;
        process.env.KEYCLOAK_AUDIENCE = "pomi-api";
        const { createAppContainer, appScopeMiddleware } =
            await import("#/Container.js");
        const { loadAppConfig } = await import("#/Config.js");
        const { appControllers } = await import("#/Controllers.js");
        const { errorHandler } = await import("@pomi/api-core");
        const express = (await import("express")).default;
        const container = createAppContainer(
            loadAppConfig({
                DATABASE_URL: databaseUrl!,
                NODE_ENV: "test",
                DISABLED_AUTH: "false",
                KEYCLOAK_ISSUER: issuer,
                KEYCLOAK_AUDIENCE: "pomi-api"
            }),
            prisma
        );
        const application = express();
        application.use(express.json());
        application.use(appScopeMiddleware(container));
        application.use(appControllers.authRegistry.middleware());
        application.use(appControllers.router);
        application.use(errorHandler);
        const server = application.listen(0, "127.0.0.1");
        await new Promise<void>((resolve) => server.once("listening", resolve));
        const address = server.address();
        assert.ok(address && typeof address !== "string");
        const api = `http://127.0.0.1:${address.port}`;
        const tag = randomUUID();
        const studentIds: number[] = [];
        const principalIds: number[] = [];
        const userIds: number[] = [];
        let groupId: number | undefined;
        let courseId: number | undefined;
        let periodId: number | undefined;
        let classId: number | undefined;
        let professorId: number | undefined;
        const token = (subject: string, email = "contact@example.test") =>
            new SignJWT({ email })
                .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
                .setSubject(subject)
                .setIssuer(issuer)
                .setAudience("pomi-api")
                .setIssuedAt()
                .setExpirationTime("5m")
                .sign(keys.privateKey);
        const request = (
            path: string,
            jwt: string,
            options: RequestInit = {}
        ) =>
            fetch(`${api}${path}`, {
                ...options,
                headers: {
                    "Authorization": `Bearer ${jwt}`,
                    "Content-Type": "application/json",
                    ...options.headers
                }
            });
        try {
            const baseId = randomInt(7000000, 8000000);
            const ra = String(randomInt(100000, 899998));
            for (const [index, name] of [
                "Owner academic name",
                "Other academic name",
                "Unclaimed academic name"
            ].entries()) {
                const student = await prisma.student.create({
                    data: {
                        id: baseId + index,
                        ra: String(Number(ra) + index),
                        name
                    }
                });
                studentIds.push(student.id);
            }
            const account = async (
                subject: string,
                role: "STUDENT" | "ADMIN" | "BOT",
                studentId: number | null
            ) => {
                const auth = await prisma.authUser.create({
                    data: {
                        issuer,
                        subject,
                        studentId,
                        displayName: `${subject}-${tag}`,
                        email: `${subject}@example.test`,
                        roles: { create: { role } }
                    }
                });
                const principal = await prisma.$transaction((tx) =>
                    createCanonicalIdentity(tx, { ...auth, roles: [{ role }] })
                );
                principalIds.push(principal.id);
                const user = await prisma.user.findUnique({
                    where: { principalId: principal.id }
                });
                if (user) userIds.push(user.id);
                return { auth, principal, user };
            };
            const owner = await account("owner", "STUDENT", studentIds[0]!);
            const other = await account("other", "STUDENT", studentIds[1]!);
            await account("admin", "ADMIN", null);
            const bot = await account("bot", "BOT", null);
            assert.notEqual(owner.user!.id, studentIds[0]);
            const dormant = await prisma.principal.create({
                data: {
                    kind: "HUMAN",
                    user: {
                        create: {
                            name: "Dormant canonical user",
                            studentId: studentIds[2],
                            legacyStudentId: studentIds[2],
                            publicBio: "Preserved unclaimed profile"
                        }
                    }
                },
                include: { user: true }
            });
            principalIds.push(dormant.id);
            userIds.push(dormant.user!.id);
            const orphanJwt = await token(
                "first-claim",
                `s${Number(ra) + 2}@dac.unicamp.br`
            );
            const firstClaim = await request("/me", orphanJwt);
            assert.equal(firstClaim.status, 200);
            const claimedIdentity = await prisma.authUser.findUniqueOrThrow({
                where: { issuer_subject: { issuer, subject: "first-claim" } },
                include: { authIdentity: true }
            });
            assert.equal(claimedIdentity.authIdentity!.principalId, dormant.id);
            assert.equal(
                (
                    await prisma.user.findUniqueOrThrow({
                        where: { id: dormant.user!.id }
                    })
                ).publicBio,
                "Preserved unclaimed profile"
            );
            const curriculum = await prisma.curriculum.create({
                data: {
                    userId: owner.user!.id,
                    name: "Preserved personal curriculum"
                }
            });
            const otherCurriculum = await prisma.curriculum.create({
                data: { userId: other.user!.id, name: "Other curriculum" }
            });
            await prisma.user.update({
                where: { id: owner.user!.id },
                data: {
                    publicBio: "Preserved profile",
                    publicProfileEnabled: true,
                    favoriteCurriculumId: curriculum.id
                }
            });
            const group = await prisma.group.create({
                data: { name: `User ownership ${tag}` }
            });
            groupId = group.id;
            await prisma.groupMembership.create({
                data: { groupId, userId: owner.user!.id, isPublic: true }
            });
            const course = await prisma.course.create({
                data: {
                    code: `OWN-${tag}`,
                    name: "Owned academic course",
                    credits: 4
                }
            });
            courseId = course.id;
            const period = await prisma.studyPeriod.create({
                data: {
                    year: randomInt(8100, 8900),
                    yearPeriod: "FIRST_SEMESTER",
                    startDate: new Date("8100-01-01T00:00:00Z")
                }
            });
            periodId = period.id;
            const professor = await prisma.professor.create({
                data: { name: `Professor ${tag}` }
            });
            professorId = professor.id;
            const classData = await prisma.class.create({
                data: {
                    code: "A",
                    courseId,
                    studyPeriodId: periodId,
                    professors: { connect: { id: professorId } }
                }
            });
            classId = classData.id;
            await prisma.studentCourseAttempt.create({
                data: {
                    userId: owner.user!.id,
                    courseId,
                    classId,
                    status: "APPROVED",
                    evaluationMode: "GRADE_AND_ATTENDANCE"
                }
            });
            const evaluationData = {
                userId: owner.user!.id,
                classId,
                professorId,
                wouldTakeAgain: 5,
                fairness: 4,
                clarity: 5,
                difficulty: 3
            };
            const evaluation = await prisma.professorEvaluation.create({
                data: evaluationData
            });
            await assert.rejects(
                prisma.professorEvaluation.create({ data: evaluationData }),
                (error) => (error as { code?: string }).code === "P2002"
            );
            await prisma.periodPlanning.create({
                data: {
                    userId: owner.user!.id,
                    studyPeriodId: periodId,
                    name: "Preserved personal semester"
                }
            });
            await prisma.botGrant.create({
                data: {
                    userId: owner.user!.id,
                    botAuthUserId: bot.auth.id,
                    capability: "STUDENT_PLANNING_READ",
                    grantedByAuthUserId: owner.auth.id
                }
            });
            const [ownerJwt, otherJwt, adminJwt, botJwt] = await Promise.all([
                token("owner"),
                token("other"),
                token("admin"),
                token("bot")
            ]);
            const path = `/student/${studentIds[0]}/curricula/${curriculum.id}`;
            const responses = await Promise.all(
                [ownerJwt, adminJwt, botJwt].map((jwt) => request(path, jwt))
            );
            assert.ok(responses.every((response) => response.status === 200));
            const representations = await Promise.all(
                responses.map(async (response) =>
                    jsonObject(await response.json())
                )
            );
            assert.deepEqual(representations[0], representations[1]);
            assert.deepEqual(representations[0], representations[2]);
            assert.equal(representations[0].studentId, studentIds[0]);
            assert.equal("userId" in representations[0], false);
            assert.equal((await request(path, otherJwt)).status, 403);
            assert.equal(
                (
                    await request(
                        `/student/${studentIds[1]}/curricula/${otherCurriculum.id}`,
                        botJwt
                    )
                ).status,
                403
            );
            assert.equal(
                (
                    await request(
                        `/student/${studentIds[0]}/curricula/${otherCurriculum.id}`,
                        adminJwt
                    )
                ).status,
                404
            );
            const profileResponse = await request(
                `/student/${studentIds[0]}/public-profile`,
                ownerJwt
            );
            assert.equal(profileResponse.status, 200);
            assert.equal(
                jsonObject(await profileResponse.json()).displayName,
                "Owner academic name"
            );
            const meResponse = await request("/me", ownerJwt);
            const me = jsonObject(await meResponse.json());
            assert.equal(me.id, owner.auth.id);
            assert.equal(me.studentId, studentIds[0]);
            assert.equal("userId" in me, false);
            const removed = await request(
                `/students/${studentIds[0]}`,
                ownerJwt,
                {
                    method: "DELETE",
                    body: JSON.stringify({ confirmationRa: ra })
                }
            );
            assert.equal(removed.status, 204);
            const preserved = await prisma.user.findUniqueOrThrow({
                where: { id: owner.user!.id }
            });
            assert.equal(preserved.studentId, null);
            assert.equal(preserved.legacyStudentId, studentIds[0]);
            assert.equal(preserved.publicBio, "Preserved profile");
            assert.equal(
                await prisma.studentCourseAttempt.count({
                    where: { userId: preserved.id }
                }),
                0
            );
            assert.ok(
                await prisma.curriculum.findUnique({
                    where: { id: curriculum.id }
                })
            );
            assert.ok(
                await prisma.professorEvaluation.findUnique({
                    where: { id: evaluation.id }
                })
            );
            assert.equal(
                await prisma.periodPlanning.count({
                    where: { userId: preserved.id }
                }),
                1
            );
            assert.equal(
                await prisma.groupMembership.count({
                    where: { userId: preserved.id }
                }),
                1
            );
            assert.equal(
                (
                    await prisma.authUser.findUniqueOrThrow({
                        where: { id: owner.auth.id }
                    })
                ).studentId,
                null
            );
        } finally {
            await new Promise<void>((resolve) => server.close(() => resolve()));
            await new Promise<void>((resolve) => jwks.close(() => resolve()));
            if (groupId) {
                await prisma.groupMembership.deleteMany({ where: { groupId } });
                await prisma.group.delete({ where: { id: groupId } });
            }
            await prisma.botGrant.deleteMany({
                where: { userId: { in: userIds } }
            });
            await prisma.professorEvaluation.deleteMany({
                where: { userId: { in: userIds } }
            });
            await prisma.studentCourseAttempt.deleteMany({
                where: { userId: { in: userIds } }
            });
            await prisma.periodPlanning.deleteMany({
                where: { userId: { in: userIds } }
            });
            await prisma.user.updateMany({
                where: { id: { in: userIds } },
                data: { favoriteCurriculumId: null }
            });
            await prisma.curriculum.deleteMany({
                where: { userId: { in: userIds } }
            });
            const credentials = await prisma.authUser.findMany({
                where: { issuer },
                select: { id: true }
            });
            await prisma.authIdentity.deleteMany({
                where: {
                    legacyAuthUserId: { in: credentials.map(({ id }) => id) }
                }
            });
            await prisma.authUser.deleteMany({ where: { issuer } });
            await prisma.user.deleteMany({ where: { id: { in: userIds } } });
            await prisma.serviceAccount.deleteMany({
                where: { principalId: { in: principalIds } }
            });
            await prisma.principal.deleteMany({
                where: { id: { in: principalIds } }
            });
            await prisma.student.deleteMany({
                where: { id: { in: studentIds } }
            });
            if (classId) await prisma.class.delete({ where: { id: classId } });
            if (professorId)
                await prisma.professor.delete({ where: { id: professorId } });
            if (courseId)
                await prisma.course.delete({ where: { id: courseId } });
            if (periodId)
                await prisma.studyPeriod.delete({ where: { id: periodId } });
            await prisma.$disconnect();
        }
    }
);
