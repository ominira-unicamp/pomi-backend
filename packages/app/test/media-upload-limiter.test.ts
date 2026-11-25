import assert from "node:assert/strict";
import test from "node:test";

import {
    MediaUploadLimiter,
    MediaUploadRateLimitError
} from "#/media/MediaUploadLimiter.js";

test("bounds simultaneous uploads and releases each admission once", () => {
    const limiter = new MediaUploadLimiter(2);
    const first = limiter.acquire(1);
    const second = limiter.acquire(2);
    assert.throws(
        () => limiter.acquire(3),
        (error: unknown) =>
            error instanceof MediaUploadRateLimitError &&
            error.retryAfterSeconds === 1
    );
    first();
    first();
    const third = limiter.acquire(3);
    second();
    third();
    assert.doesNotThrow(() => limiter.acquire(4));
});

test("limits upload attempts per identity until its window expires", () => {
    const limiter = new MediaUploadLimiter(2, 2, 60_000);
    limiter.acquire(1, 0)();
    limiter.acquire(1, 0)();
    assert.throws(
        () => limiter.acquire(1, 0),
        (error: unknown) =>
            error instanceof MediaUploadRateLimitError &&
            error.retryAfterSeconds === 60
    );
    limiter.acquire(2, 0)();
    assert.doesNotThrow(() => limiter.acquire(1, 60_000)());
});

test("a concurrency rejection does not consume another identity's rate quota", () => {
    const limiter = new MediaUploadLimiter(1, 1, 60_000);
    const release = limiter.acquire(1, 0);
    assert.throws(() => limiter.acquire(2, 0), /muitos uploads/);
    release();
    assert.doesNotThrow(() => limiter.acquire(2, 0)());
});
