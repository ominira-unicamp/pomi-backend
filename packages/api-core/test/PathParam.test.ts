import assert from "node:assert/strict";
import test from "node:test";

import { pathParam } from "../src/index.js";

test("coerces an integer path parameter to a number", () => {
    const result = pathParam.integer().safeParse("42");

    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data, 42);
});

test("rejects non-integer values for an integer path parameter", () => {
    assert.equal(pathParam.integer().safeParse("4.2").success, false);
    assert.equal(pathParam.integer().safeParse("not-an-id").success, false);
});

test("preserves positive integer validation", () => {
    assert.equal(pathParam.positiveInteger().safeParse("7").success, true);
    assert.equal(pathParam.positiveInteger().safeParse("0").success, false);
});
