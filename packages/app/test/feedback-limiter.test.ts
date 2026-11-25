import { loadAppConfig } from "#/Config.js";
import { FeedbackRateLimiter } from "#/modules/feedback/feedback-report/Feedback.limiter.js";
import type { DatabaseClient } from "@pomi/db";
import assert from "node:assert/strict";
import test from "node:test";

process.env.DISABLED_AUTH = "true";
const { createAppContainer } = await import("#/Container.js");

test("feedback limits preserve the window boundary, per-address counters and rounded retry delay", () => {
    let now = 1000;
    const limiter = new FeedbackRateLimiter(
        { maximum: 2, windowMilliseconds: 2500 },
        { now: () => new Date(now) }
    );
    assert.equal(limiter.consume("a").allowed, true);
    assert.equal(limiter.consume("a").allowed, true);
    assert.deepEqual(limiter.consume("a"), {
        allowed: false,
        retryAfterSeconds: 3
    });
    assert.equal(limiter.consume("b").allowed, true);
    now = 3499;
    assert.deepEqual(limiter.consume("a"), {
        allowed: false,
        retryAfterSeconds: 1
    });
    now = 3500;
    assert.equal(limiter.consume("a").allowed, true);
});

test("feedback limits reject invalid definitions and invalid startup configuration", () => {
    for (const value of [0, -1, 1.5, Infinity, NaN]) {
        assert.throws(
            () =>
                new FeedbackRateLimiter({
                    maximum: value,
                    windowMilliseconds: 1000
                }),
            RangeError
        );
        assert.throws(
            () =>
                new FeedbackRateLimiter({
                    maximum: 1,
                    windowMilliseconds: value
                }),
            RangeError
        );
    }
    assert.throws(() =>
        loadAppConfig({
            DATABASE_URL: "postgresql://test.invalid/pomi",
            DISABLED_AUTH: "true",
            FEEDBACK_RATE_LIMIT_MAX: "0"
        })
    );
});

test("feedback limits share the same instance across request scopes", async () => {
    const container = createAppContainer(
        loadAppConfig({
            DATABASE_URL: "postgresql://test.invalid/pomi",
            DISABLED_AUTH: "true",
            FEEDBACK_RATE_LIMIT_MAX: "1"
        }),
        {} as DatabaseClient
    );
    const first = container.createScope();
    const second = container.createScope();
    try {
        const limiter = first.resolve("feedbackRateLimiter");
        assert.equal(second.resolve("feedbackRateLimiter"), limiter);
        assert.equal(limiter.consume("same-address").allowed, true);
        assert.equal(
            second.resolve("feedbackRateLimiter").consume("same-address")
                .allowed,
            false
        );
    } finally {
        await first.dispose();
        await second.dispose();
        await container.dispose();
    }
});

test("feedback HTTP rejection preserves the rate-limit problem and Retry-After", async () => {
    const [
        { default: express },
        { createFeedbackReportService },
        { default: controller },
        { errorHandler }
    ] = await Promise.all([
        import("express"),
        import("#/modules/feedback/feedback-report/FeedbackReport.service.js"),
        import("#/modules/feedback/feedback-report/FeedbackReport.controller.js"),
        import("@pomi/api-core")
    ]);
    const service = createFeedbackReportService({
        prisma: {
            catalogCourse: { findUnique: async () => null },
            feedbackReport: {
                create: async () => ({
                    createdAt: new Date("2026-11-01T00:00:00Z")
                })
            }
        } as never,
        feedbackRateLimiter: new FeedbackRateLimiter(
            { maximum: 2, windowMilliseconds: 2500 },
            { now: () => new Date(1000) }
        )
    });
    const application = express();
    application.use(express.json());
    application.use((request, _response, next) => {
        request.scope = { cradle: { feedbackReportService: service } } as never;
        next();
    });
    application.use(controller.router);
    application.use(errorHandler);
    const server = application.listen(0, "127.0.0.1");
    try {
        await new Promise<void>((resolve) => server.once("listening", resolve));
        const address = server.address();
        assert.ok(address && typeof address !== "string");
        const url = `http://127.0.0.1:${address.port}/feedback-reports`;
        const options = {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                kind: "BUG",
                target: { type: "GENERAL" },
                title: "Falha na tela inicial",
                description: "A página inicial não carrega após entrar no POMI."
            })
        };
        const invalidReference = await fetch(url, {
            ...options,
            body: JSON.stringify({
                ...JSON.parse(options.body),
                target: {
                    type: "ACADEMIC_RESOURCE",
                    academicResource: { type: "CATALOG_COURSE", id: 100 }
                }
            })
        });
        assert.equal(invalidReference.status, 422);
        const referenceProblem = (await invalidReference.json()) as {
            type: string;
            fields: { path: string[] }[];
        };
        assert.equal(
            referenceProblem.type,
            "urn:pomi:problem:reference-not-found"
        );
        assert.equal(referenceProblem.fields[0]?.path[0], "body");
        assert.equal((await fetch(url, options)).status, 201);
        const rejected = await fetch(url, options);
        assert.equal(rejected.status, 429);
        assert.equal(rejected.headers.get("Retry-After"), "3");
        const problem = (await rejected.json()) as { type: string };
        assert.equal(problem.type, "urn:pomi:problem:feedback-rate-limit");
    } finally {
        await new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve()))
        );
    }
});
