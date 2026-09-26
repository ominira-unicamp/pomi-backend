import { createStudentService } from "#/modules/planning/student/Student.service.js";
import assert from "node:assert/strict";
import test from "node:test";

process.env.DISABLED_AUTH = "true";

test("rejects a student specialization from another program", async () => {
    const service = createStudentService({
        prisma: {
            student: {
                findUnique: () => Promise.resolve(null),
                create: () =>
                    assert.fail("must not create incompatible student")
            },
            specialization: {
                findUnique: () => Promise.resolve({ programId: 8 })
            },
            catalog: {
                findUnique: () => Promise.resolve({ id: 2023 })
            },
            catalogProgram: {
                findUnique: () => Promise.resolve({ id: 1 })
            }
        } as never
    });
    const result = await service.create(
        {
            authUserId: 1,
            issuer: "http://keycloak/realms/pomi",
            subject: "student",
            email: "j123456@dac.unicamp.br",
            roles: new Set(["STUDENT"]),
            capabilities: new Set(),
            studentId: null
        } as never,
        {
            name: "Pessoa",
            catalogId: 2023,
            programId: 7,
            specializationId: 11
        }
    );

    assert.equal(
        result.isErr() && result.error.type,
        "urn:pomi:problem:invalid-student-profile"
    );
});

test("rejects changing a program when the current specialization becomes incompatible", async () => {
    const service = createStudentService({
        prisma: {
            student: {
                findUnique: () =>
                    Promise.resolve({
                        id: 3,
                        ra: "123",
                        name: "Pessoa",
                        programId: 7,
                        specializationId: 11,
                        catalogId: 2023,
                        languageId: null
                    }),
                update: () =>
                    assert.fail("must not update incompatible student")
            },
            specialization: {
                findUnique: () => Promise.resolve({ programId: 7 })
            },
            catalog: {
                findUnique: () => Promise.resolve({ id: 2023 })
            },
            catalogProgram: {
                findUnique: () => Promise.resolve({ id: 1 })
            }
        } as never
    });
    const result = await service.patch(3, { programId: 8 });

    assert.equal(
        result.isErr() && result.error.type,
        "urn:pomi:problem:invalid-student-profile"
    );
});
