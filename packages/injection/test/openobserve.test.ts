import assert from "node:assert/strict";
import { test } from "node:test";
import {
    createOpenObserveStream,
    openObserveConfig
} from "../src/openobserve.js";

function withEnvironment(
    values: Record<string, string | undefined>,
    run: () => Promise<void> | void
) {
    const previous = Object.fromEntries(
        Object.keys(values).map((key) => [key, process.env[key]])
    );
    for (const [key, value] of Object.entries(values)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
    return Promise.resolve(run()).finally(() => {
        for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    });
}

test("OpenObserve da injection é opcional", () =>
    withEnvironment(
        {
            OPENOBSERVE_URL: undefined,
            OPENOBSERVE_AUTH: undefined,
            OPENOBSERVE_USER: undefined,
            OPENOBSERVE_PASSWORD: undefined
        },
        () => assert.equal(openObserveConfig(), undefined)
    ));

test("OpenObserve da injection deriva Basic Auth", () =>
    withEnvironment(
        {
            OPENOBSERVE_URL: "http://observe/api/default",
            OPENOBSERVE_AUTH: undefined,
            OPENOBSERVE_USER: "admin",
            OPENOBSERVE_PASSWORD: "secret",
            OPENOBSERVE_STREAM: "injection-test"
        },
        () =>
            assert.deepEqual(openObserveConfig(), {
                url: "http://observe/api/default/injection-test/_json",
                auth: `Basic ${Buffer.from("admin:secret").toString("base64")}`
            })
    ));

test("OpenObserve da injection faz flush no encerramento", async () => {
    const requests: RequestInit[] = [];
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async (_input, init) => {
        requests.push(init ?? {});
        return new Response(null, { status: 200 });
    }) as typeof fetch;
    try {
        const stream = createOpenObserveStream(
            { url: "http://observe/logs/_json", auth: "Basic token" },
            (error) => {
                throw error;
            }
        );
        await new Promise<void>((resolve, reject) => {
            stream.on("error", reject);
            stream.end(JSON.stringify({ event: "test" }), () => resolve());
        });
        assert.equal(requests.length, 1);
        assert.match(String(requests[0]?.body), /test/);
    } finally {
        globalThis.fetch = previousFetch;
    }
});
