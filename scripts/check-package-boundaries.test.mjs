import assert from "node:assert/strict";
import test from "node:test";
import { checkAppModuleBoundaries } from "./check-package-boundaries.mjs";

test("use cases reject static, dynamic and type-only HTTP and container dependencies", () => {
    for (const source of [
        'import IO from "./Feature.contract.js";',
        'const context = await import("#/Container.js");',
        'type Context = import("#/BuildHandler.js").Context;',
        'import type {Input} from "./Feature.http.js";'
    ])
        assert.ok(
            checkAppModuleBoundaries("Feature.use-case.ts", source).length
        );
    assert.deepEqual(
        checkAppModuleBoundaries(
            "Feature.use-case.ts",
            'import type {Input} from "./Feature.schemas.js";'
        ),
        []
    );
});

test("presenters allow payload types and date conversion while rejecting I/O and clock reads", () => {
    assert.deepEqual(
        checkAppModuleBoundaries(
            "Feature.presenter.ts",
            'import type {MyPrisma} from "@pomi/db"; import {type Row} from "./Feature.queries.js"; const date = new Date(value);'
        ),
        []
    );
    for (const source of [
        'import {createDatabaseClient} from "@pomi/db";',
        "const date = new Date();",
        "await db.student.findUnique({});",
        'await import("node:fs");',
        "await tx.$transaction(work);"
    ])
        assert.ok(
            checkAppModuleBoundaries("Feature.presenter.ts", source).length
        );
});

test("pure rules cannot load facts, read the global clock or import transport", () => {
    for (const source of [
        'import type {PrismaClient} from "@pomi/db";',
        'import {load} from "./Feature.queries.js";',
        "const now = Date.now();",
        'import {schema} from "./Feature.contract.js";'
    ])
        assert.ok(checkAppModuleBoundaries("Feature.rules.ts", source).length);
    assert.deepEqual(
        checkAppModuleBoundaries(
            "Feature.rules.ts",
            'import type {AttemptStatus} from "../academic/Academic.types.js"; import {ok} from "@pomi/api-core";'
        ),
        []
    );
});

test("access uses the supplied database client without opening transactions", () => {
    assert.deepEqual(
        checkAppModuleBoundaries(
            "Feature.access.ts",
            "await db.student.findUnique({});"
        ),
        []
    );
    for (const source of [
        "await db.$transaction(work);",
        'import {runAtomic} from "#/application/transactions.js";',
        'import {service} from "./Feature.service.js";'
    ])
        assert.ok(checkAppModuleBoundaries("Feature.access.ts", source).length);
});

test("shared schemas and image resources do not depend on HTTP construction", () => {
    assert.ok(
        checkAppModuleBoundaries(
            "Feature.schemas.ts",
            'import {id} from "./Feature.http.js";'
        ).length
    );
    assert.ok(
        checkAppModuleBoundaries(
            "Feature.resource.ts",
            'import {router} from "./Feature.endpoints.js";'
        ).length
    );
    assert.deepEqual(
        checkAppModuleBoundaries(
            "Feature.resource.ts",
            'import {defineImageResource} from "#/media/public.js";'
        ),
        []
    );
});
