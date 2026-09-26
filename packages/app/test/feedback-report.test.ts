import { FeedbackRateLimiter } from "#/modules/feedback/feedback-report/FeedbackRateLimiter.js";
import IO from "#/modules/feedback/feedback-report/FeedbackReport.contract.js";
import { createFeedbackReportService } from "#/modules/feedback/feedback-report/FeedbackReport.service.js";
import assert from "node:assert/strict";
import test from "node:test";

test("declares anonymous and identified feedback paths", () => {
    assert.deepEqual(IO.createAnonymous.meta.path, [
        { type: "literal", value: "feedback-reports" }
    ]);
    assert.deepEqual(IO.createForStudent.meta.path, [
        { type: "literal", value: "student" },
        { type: "param", name: "sid" },
        { type: "literal", value: "feedback-reports" }
    ]);
    assert.equal(
        IO.createForStudent.request.safeParse({
            path: { sid: "1" },
            body: {
                kind: "SUGGESTION",
                target: { type: "FEATURE", feature: { key: "agenda" } },
                title: "Melhorar a agenda",
                description:
                    "Seria útil exibir as próximas aulas de forma resumida."
            }
        }).success,
        true
    );
    assert.deepEqual(IO.listStudent.meta.path, [
        { type: "literal", value: "student" },
        { type: "param", name: "sid" },
        { type: "literal", value: "feedback-reports" }
    ]);
    assert.deepEqual(IO.patchAdmin.meta.path, [
        { type: "literal", value: "admin" },
        { type: "literal", value: "feedback-reports" },
        { type: "param", name: "id" }
    ]);
    assert.equal(
        IO.patchAdmin.request.safeParse({
            path: { id: "1" },
            body: { status: "CLOSED", adminMessage: "Resolvido." }
        }).success,
        true
    );
});

test("lists a student's feedback reports", async () => {
    const service = createFeedbackReportService({
        prisma: {
            feedbackReport: {
                findMany: async () => [
                    {
                        id: 3,
                        kind: "BUG",
                        targetType: "GENERAL",
                        featureKey: null,
                        academicResourceType: null,
                        academicResourceId: null,
                        title: "Falha no menu",
                        description: "O menu não abre nesta tela.",
                        sourcePath: "/",
                        status: "OPEN",
                        adminMessage: null,
                        reporterStudentId: 7,
                        createdAt: new Date("2026-09-01T12:00:00.000Z"),
                        updatedAt: new Date("2026-09-01T12:00:00.000Z")
                    }
                ]
            }
        } as never,
        feedbackRateLimiter: new FeedbackRateLimiter(2, 60)
    });

    await assert.doesNotReject(async () => {
        const reports = await service.listForStudent(7, {});
        assert.equal(reports[0]?.status, "OPEN");
        assert.equal(reports[0]?.reporterStudentId, 7);
    });
});

test("updates a report status and administrative message", async () => {
    const service = createFeedbackReportService({
        prisma: {
            feedbackReport: {
                findUnique: async () => ({ id: 3 }),
                update: async ({ data }: { data: unknown }) => {
                    assert.deepEqual(data, {
                        status: "CLOSED",
                        adminMessage: "A solicitação foi encerrada."
                    });
                    return {
                        id: 3,
                        kind: "BUG",
                        targetType: "GENERAL",
                        featureKey: null,
                        academicResourceType: null,
                        academicResourceId: null,
                        title: "Falha no menu",
                        description: "O menu não abre nesta tela.",
                        sourcePath: "/",
                        status: "CLOSED",
                        adminMessage: "A solicitação foi encerrada.",
                        reporterStudentId: 7,
                        createdAt: new Date("2026-09-01T12:00:00.000Z"),
                        updatedAt: new Date("2026-09-02T12:00:00.000Z")
                    };
                }
            }
        } as never,
        feedbackRateLimiter: new FeedbackRateLimiter(2, 60)
    });

    const result = await service.patchAdmin(3, {
        status: "CLOSED",
        adminMessage: "A solicitação foi encerrada."
    });

    assert.equal(result.isOk(), true);
    if (result.isOk()) assert.equal(result.value.status, "CLOSED");
});

test("stores an anonymous feedback report without a student", async () => {
    const service = createFeedbackReportService({
        prisma: {
            feedbackReport: {
                create: async ({ data }: { data: unknown }) => {
                    assert.deepEqual(data, {
                        kind: "BUG",
                        targetType: "GENERAL",
                        featureKey: null,
                        academicResourceType: null,
                        academicResourceId: null,
                        title: "Falha na tela inicial",
                        description:
                            "A página inicial não carrega após entrar no POMI.",
                        sourcePath: "/",
                        reporterStudentId: null
                    });
                    return { createdAt: new Date("2026-09-01T12:00:00.000Z") };
                }
            }
        } as never,
        feedbackRateLimiter: new FeedbackRateLimiter(2, 60)
    });

    const result = await service.createAnonymous(
        {
            kind: "BUG",
            target: { type: "GENERAL" },
            title: "Falha na tela inicial",
            description: "A página inicial não carrega após entrar no POMI.",
            sourcePath: "/"
        },
        "127.0.0.1"
    );

    assert.equal(result.isOk(), true);
    if (result.isOk())
        assert.deepEqual(result.value, {
            createdAt: "2026-09-01T12:00:00.000Z"
        });
});

test("rejects an academic feedback report for an unknown resource", async () => {
    const service = createFeedbackReportService({
        prisma: {
            catalogCourse: { findUnique: async () => null }
        } as never,
        feedbackRateLimiter: new FeedbackRateLimiter(2, 60)
    });

    const result = await service.createForStudent(1, {
        kind: "DATA_ISSUE",
        target: {
            type: "ACADEMIC_RESOURCE",
            academicResource: { type: "CATALOG_COURSE", id: 10 }
        },
        title: "Pré-requisito incorreto",
        description:
            "A informação de pré-requisito exibida não corresponde ao catálogo."
    });

    assert.equal(result.isErr(), true);
    if (result.isErr())
        assert.equal(result.error.type, "urn:pomi:problem:reference-not-found");
});

test("limits anonymous feedback reports by source address", async () => {
    const service = createFeedbackReportService({
        prisma: {
            feedbackReport: {
                create: async () => ({
                    createdAt: new Date("2026-09-01T12:00:00.000Z")
                })
            }
        } as never,
        feedbackRateLimiter: new FeedbackRateLimiter(1, 60)
    });
    const input = {
        kind: "BUG" as const,
        target: { type: "GENERAL" as const },
        title: "Falha na tela inicial",
        description: "A página inicial não carrega após entrar no POMI."
    };

    await service.createAnonymous(input, "127.0.0.1");
    const result = await service.createAnonymous(input, "127.0.0.1");

    assert.equal(result.isErr(), true);
    if (result.isErr())
        assert.equal(result.error.type, "urn:pomi:problem:feedback-rate-limit");
});
