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
    "canonical HTTP uses explicit User ids for humans and bots and academic removal preserves personal resources",
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
        let catalogId: number | undefined;
        let roomId: number | undefined;
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
            const newcomerToken = await new SignJWT({
                azp: "pomi-frontend",
                name: "New person",
                email: "new@example.test"
            })
                .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
                .setSubject("new-person")
                .setIssuer(issuer)
                .setAudience("pomi-api")
                .setIssuedAt()
                .setExpirationTime("5m")
                .sign(keys.privateKey);
            const newcomerResponse = await request("/me", newcomerToken);
            assert.equal(newcomerResponse.status, 200);
            const newcomer = jsonObject(await newcomerResponse.json());
            assert.equal(typeof newcomer.userId, "number");
            assert.equal(typeof newcomer.principalId, "number");
            principalIds.push(newcomer.principalId as number);
            userIds.push(newcomer.userId as number);
            assert.equal(newcomer.studentId, null);
            assert.deepEqual(newcomer.roles, []);
            const accountResponse = await request(
                `/users/${newcomer.userId}`,
                newcomerToken
            );
            assert.equal(accountResponse.status, 200);
            assert.equal(
                jsonObject(await accountResponse.json()).name,
                "New person"
            );
            const repeated = jsonObject(
                await (await request("/me", newcomerToken)).json()
            );
            assert.equal(repeated.authIdentityId, newcomer.authIdentityId);
            assert.equal(
                await prisma.authIdentity.count({
                    where: { issuer, subject: "new-person" }
                }),
                1
            );
            assert.equal(
                (await request("/admin/students", newcomerToken)).status,
                403
            );
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
                role: "STUDENT" | "ADMIN" | "BOT" | null,
                studentId: number | null
            ) => {
                const auth = await prisma.$transaction((tx) =>
                    createCanonicalIdentity(tx, {
                        issuer,
                        subject,
                        studentId,
                        displayName: `${subject}-${tag}`,
                        email: `${subject}@example.test`,
                        roles: role ? [{ role }] : []
                    })
                );
                const legacyId = baseId + 10000000 + principalIds.length;
                await prisma.authIdentity.update({
                    where: { id: auth.id },
                    data: { legacyId }
                });
                auth.legacyId = legacyId;
                assert.notEqual(auth.legacyId, auth.id);
                const principal = auth.principal;
                principalIds.push(principal.id);
                const user = await prisma.user.findUnique({
                    where: { principalId: principal.id }
                });
                if (user) userIds.push(user.id);
                return { auth, principal, user };
            };
            const owner = await account("owner", "STUDENT", studentIds[0]!);
            const other = await account("other", "STUDENT", studentIds[1]!);
            const administrator = await account("admin", "ADMIN", null);
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
            assert.equal(firstClaim.status, 403);
            assert.equal(
                await prisma.authIdentity.count({
                    where: { issuer, subject: "first-claim" }
                }),
                0
            );
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
                    name: "Owner personal name",
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
                    botAuthIdentityId: bot.auth.id,
                    capability: "STUDENT_PLANNING_READ",
                    grantedByAuthIdentityId: owner.auth.id
                }
            });
            const [ownerJwt, otherJwt, adminJwt, botJwt] = await Promise.all([
                token("owner", `s${ra}@dac.unicamp.br`),
                token("other"),
                token("admin"),
                token("bot")
            ]);
            const identitiesResponse = await request(
                "/admin/auth-identities",
                adminJwt
            );
            assert.equal(identitiesResponse.status, 200);
            const identitiesPage = jsonObject(await identitiesResponse.json());
            assert.ok(Array.isArray(identitiesPage.data));
            const ownerIdentity = identitiesPage.data
                .map(jsonObject)
                .find((value) => value.id === owner.auth.id);
            assert.ok(ownerIdentity);
            assert.equal(ownerIdentity.userId, owner.user!.id);
            assert.equal(ownerIdentity.principalId, owner.principal.id);
            assert.equal(ownerIdentity.serviceAccountId, null);
            assert.equal(
                (await request("/admin/auth-identities", ownerJwt)).status,
                403
            );
            const noAcademic = await account("no-academic", null, null);
            const noAcademicJwt = await token("no-academic");
            const catalog = await prisma.catalog.create({
                data: { year: period.year }
            });
            catalogId = catalog.id;
            await prisma.catalogCourse.create({
                data: {
                    catalogId,
                    courseId: course.id,
                    name: course.name,
                    evaluation: "GRADE_AND_ATTENDANCE"
                }
            });
            const room = await prisma.room.create({
                data: { code: `Room-${tag}` }
            });
            roomId = room.id;
            const schedule = await prisma.classSchedule.create({
                data: {
                    classId: classData.id,
                    roomId,
                    dayOfWeek: "THURSDAY",
                    start: "08:00",
                    end: "10:00"
                }
            });
            const attemptsPath = `/users/${noAcademic.user!.id}/student/course-attempts`;
            const createdAttempt = await request(attemptsPath, noAcademicJwt, {
                method: "POST",
                body: JSON.stringify({ courseId, classId, status: "ENROLLED" })
            });
            assert.equal(createdAttempt.status, 201);
            const attempt = jsonObject(await createdAttempt.json());
            const absencePath = `${attemptsPath}/${attempt.id}/absences`;
            const createdAbsence = await request(absencePath, noAcademicJwt, {
                method: "POST",
                body: JSON.stringify({
                    classScheduleId: schedule.id,
                    date: "2026-08-20"
                })
            });
            assert.equal(createdAbsence.status, 201);
            const absence = jsonObject(await createdAbsence.json());
            assert.equal(
                (await request(absencePath, noAcademicJwt)).status,
                200
            );
            assert.equal(
                (
                    await request(
                        `/users/${owner.user!.id}/student/course-attempts/${attempt.id}/absences`,
                        adminJwt
                    )
                ).status,
                404
            );
            assert.equal((await request(absencePath, otherJwt)).status, 403);
            const importedHistory = await request(
                `/users/${noAcademic.user!.id}/student/course-history`,
                noAcademicJwt,
                {
                    method: "POST",
                    body: JSON.stringify({
                        format: "pomi-student-history",
                        version: 1,
                        student: { ra: "123456" },
                        semesters: [
                            {
                                year: period.year,
                                yearPeriod: period.yearPeriod,
                                courses: [
                                    {
                                        code: course.code,
                                        name: course.name,
                                        classCode: "A",
                                        grade: null,
                                        workloadHours: 60,
                                        credits: 4,
                                        status: "ENROLLED"
                                    }
                                ]
                            }
                        ]
                    })
                }
            );
            assert.equal(importedHistory.status, 200);
            assert.equal(jsonObject(await importedHistory.json()).updated, 1);
            assert.equal(
                (
                    await prisma.user.findUniqueOrThrow({
                        where: { id: noAcademic.user!.id }
                    })
                ).studentId,
                null
            );
            assert.equal(
                (
                    await request(
                        `${absencePath}/${absence.id}`,
                        noAcademicJwt,
                        { method: "DELETE" }
                    )
                ).status,
                204
            );
            const ownerAttempt =
                await prisma.studentCourseAttempt.findFirstOrThrow({
                    where: { userId: owner.user!.id }
                });
            const preservedAbsence = await prisma.studentAbsence.create({
                data: {
                    studentCourseAttemptId: ownerAttempt.id,
                    classScheduleId: schedule.id,
                    date: new Date("2026-08-20T00:00:00Z")
                }
            });

            assert.equal(
                (await request(`/users/${noAcademic.user!.id}`, noAcademicJwt))
                    .status,
                200
            );
            assert.equal(
                (
                    await request(
                        `/users/${noAcademic.user!.id}/profile`,
                        noAcademicJwt
                    )
                ).status,
                200
            );
            assert.equal(
                (
                    await request(
                        `/users/${noAcademic.user!.id}/curriculums`,
                        noAcademicJwt
                    )
                ).status,
                200
            );
            assert.equal(
                (
                    await request(
                        `/users/${noAcademic.user!.id}/student/course-attempts`,
                        noAcademicJwt
                    )
                ).status,
                200
            );
            assert.equal(
                (
                    await request(
                        `/users/${noAcademic.user!.id}/bot-grants`,
                        noAcademicJwt
                    )
                ).status,
                200
            );
            assert.equal(
                (await request(`/users/${owner.user!.id}/bot-grants`, botJwt))
                    .status,
                403
            );
            assert.equal(
                (
                    await request(
                        `/users/${other.user!.id}/curriculums/${curriculum.id}`,
                        adminJwt
                    )
                ).status,
                404
            );
            assert.equal(
                (await request(`/student/${studentIds[0]}/curricula`, ownerJwt))
                    .status,
                404
            );
            assert.equal(
                (await request("/me/bot-grants", ownerJwt)).status,
                404
            );
            const registeredUser = await account(
                "registered-user",
                "STUDENT",
                null
            );
            const registrationPath = `/users/${registeredUser.user!.id}/student`;
            const registrationBody = {
                ra: String(Number(ra) + 3),
                name: "Explicit academic complement"
            };
            const registration = await request(registrationPath, adminJwt, {
                method: "POST",
                body: JSON.stringify(registrationBody)
            });
            assert.equal(registration.status, 201);
            const academic = jsonObject(await registration.json());
            assert.equal(academic.userId, registeredUser.user!.id);
            assert.equal(academic.ra, registrationBody.ra);
            assert.equal(typeof academic.id, "number");
            studentIds.push(academic.id as number);
            assert.equal(
                (
                    await request(registrationPath, adminJwt, {
                        method: "POST",
                        body: JSON.stringify(registrationBody)
                    })
                ).status,
                409
            );
            const registeredMe = jsonObject(
                await (
                    await request("/me", await token("registered-user"))
                ).json()
            );
            assert.equal(registeredMe.studentId, academic.id);
            assert.equal(
                (
                    await prisma.user.findUniqueOrThrow({
                        where: { id: administrator.user!.id }
                    })
                ).studentId,
                null
            );
            const path = `/users/${owner.user!.id}/curriculums/${curriculum.id}`;
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
            assert.equal(representations[0].userId, owner.user!.id);
            assert.equal("studentId" in representations[0], false);
            assert.equal((await request(path, otherJwt)).status, 403);
            assert.equal(
                (
                    await request(
                        `/users/${other.user!.id}/curriculums/${otherCurriculum.id}`,
                        botJwt
                    )
                ).status,
                403
            );
            assert.equal(
                (
                    await request(
                        `/users/${owner.user!.id}/curriculums/${otherCurriculum.id}`,
                        adminJwt
                    )
                ).status,
                404
            );
            const foreignPreference = {
                method: "PATCH",
                body: JSON.stringify({
                    favoriteCurriculumId: otherCurriculum.id
                })
            };
            assert.equal(
                (
                    await request(
                        `/users/${owner.user!.id}/preferences`,
                        ownerJwt,
                        foreignPreference
                    )
                ).status,
                404
            );
            assert.equal(
                (
                    await request(
                        `/users/${owner.user!.id}/preferences`,
                        adminJwt,
                        foreignPreference
                    )
                ).status,
                404
            );
            assert.equal(
                (
                    await prisma.user.findUniqueOrThrow({
                        where: { id: owner.user!.id }
                    })
                ).favoriteCurriculumId,
                curriculum.id
            );
            const grantsResponse = await request(
                `/users/${owner.user!.id}/bot-grants`,
                ownerJwt
            );
            assert.equal(grantsResponse.status, 200);
            const grantsPage = jsonObject(await grantsResponse.json());
            assert.ok(Array.isArray(grantsPage.data));
            assert.equal(
                jsonObject(grantsPage.data[0]).botAuthIdentityId,
                bot.auth.id
            );
            assert.equal(jsonObject(grantsPage.data[0]).userId, owner.user!.id);
            const grantPath = `/users/${owner.user!.id}/bot-grants/${bot.auth.id}`;
            assert.equal(
                (
                    await request(grantPath, ownerJwt, {
                        method: "PUT",
                        body: JSON.stringify({
                            capabilities: [],
                            authorAuthIdentityId: other.auth.id
                        })
                    })
                ).status,
                403
            );
            assert.equal((await request(path, botJwt)).status, 200);
            assert.equal(
                (
                    await request(grantPath, ownerJwt, {
                        method: "PUT",
                        body: JSON.stringify({
                            capabilities: [],
                            authorAuthIdentityId: owner.auth.id
                        })
                    })
                ).status,
                204
            );
            assert.equal((await request(path, botJwt)).status, 403);
            const revoked = await prisma.botGrant.findFirstOrThrow({
                where: {
                    userId: owner.user!.id,
                    botAuthIdentityId: bot.auth.id,
                    revokedAt: { not: null }
                }
            });
            assert.equal(revoked.revokedByAuthIdentityId, owner.auth.id);
            assert.equal(
                (
                    await request(grantPath, adminJwt, {
                        method: "PUT",
                        body: JSON.stringify({
                            capabilities: ["STUDENT_PLANNING_READ"],
                            authorAuthIdentityId: administrator.auth.id
                        })
                    })
                ).status,
                204
            );
            assert.equal((await request(path, botJwt)).status, 200);
            const granted = await prisma.botGrant.findFirstOrThrow({
                where: {
                    userId: owner.user!.id,
                    botAuthIdentityId: bot.auth.id,
                    revokedAt: null
                }
            });
            assert.equal(
                granted.grantedByAuthIdentityId,
                administrator.auth.id
            );
            const profileResponse = await request(
                `/users/${owner.user!.id}/profile`,
                ownerJwt
            );
            assert.equal(profileResponse.status, 200);
            assert.equal(
                jsonObject(await profileResponse.json()).displayName,
                "Owner personal name"
            );
            const meResponse = await request("/me", ownerJwt);
            const me = jsonObject(await meResponse.json());
            assert.equal(me.principalId, owner.principal.id);
            assert.equal(me.authIdentityId, owner.auth.id);
            assert.equal("id" in me, false);
            assert.equal(me.studentId, studentIds[0]);
            assert.equal(me.userId, owner.user!.id);
            const removed = await request(
                `/users/${owner.user!.id}/student`,
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
            const meAfterRemoval = jsonObject(
                await (await request("/me", ownerJwt)).json()
            );
            assert.equal(meAfterRemoval.studentId, null);
            assert.equal((await request(path, ownerJwt)).status, 200);
            assert.equal(
                await prisma.student.count({ where: { id: studentIds[0] } }),
                0
            );
            assert.equal(preserved.legacyStudentId, studentIds[0]);
            assert.equal(preserved.publicBio, "Preserved profile");
            assert.ok(
                await prisma.studentAbsence.findUnique({
                    where: { id: preservedAbsence.id }
                })
            );
            assert.equal(
                (
                    await request(
                        `/users/${owner.user!.id}/student/course-attempts/${ownerAttempt.id}/absences`,
                        ownerJwt
                    )
                ).status,
                200
            );
            assert.equal(
                await prisma.studentCourseAttempt.count({
                    where: { userId: preserved.id }
                }),
                1
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
                    await prisma.authIdentity.findUniqueOrThrow({
                        where: { id: owner.auth.id }
                    })
                ).legacyStudentId,
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
            await prisma.authIdentity.deleteMany({ where: { issuer } });
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
            if (classId)
                await prisma.classSchedule.deleteMany({ where: { classId } });
            if (roomId) await prisma.room.delete({ where: { id: roomId } });
            if (catalogId) {
                await prisma.catalogCourse.deleteMany({ where: { catalogId } });
                await prisma.catalog.delete({ where: { id: catalogId } });
            }
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
