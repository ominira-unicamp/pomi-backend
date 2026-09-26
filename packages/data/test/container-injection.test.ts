import assert from "node:assert/strict";
import test from "node:test";

import { createDataContainer } from "#/Container.js";

test("resolves services with the Prisma dependency from the cradle", () => {
    const container = createDataContainer(
        {
            databaseUrl: "postgresql://test",
            nodeEnv: "test",
            port: 3000
        },
        {} as never
    );

    const scope = container.createScope();

    assert.equal(typeof scope.cradle.courseService.list, "function");
    assert.equal(typeof scope.cradle.catalogProgramService.list, "function");
    assert.equal(typeof scope.cradle.exchangeNoticeService.list, "function");
    assert.equal(typeof scope.cradle.exchangePlaceService.list, "function");
    assert.equal(
        typeof scope.cradle.zodIds.course.exists.safeParse,
        "function"
    );
});
