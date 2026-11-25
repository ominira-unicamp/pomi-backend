import { systemClock } from "#/application/Clock.js";
import { loadAppConfig } from "#/Config.js";
import type { DatabaseClient } from "@pomi/db";
import { asValue } from "awilix";
import assert from "node:assert/strict";
import test from "node:test";
import { friendshipFixture } from "./fixtures/friendship.js";

process.env.DISABLED_AUTH = "true";
const { createAppContainer } = await import("#/Container.js");

test("friendship service receives the scoped clock through the application container", async () => {
    const fixture = friendshipFixture();
    const config = loadAppConfig({
        DATABASE_URL: "postgresql://test.invalid/pomi",
        DISABLED_AUTH: "true",
        NODE_ENV: "test"
    });
    const container = createAppContainer(
        config,
        fixture.prisma as DatabaseClient
    );
    const scope = container
        .createScope()
        .register({ clock: asValue(fixture.clock) });
    try {
        assert.equal(container.resolve("clock"), systemClock);
        const result = await scope
            .resolve("socialFriendshipService")
            .acceptFriendship(7, 3);
        assert.equal(result.isOk(), true);
        assert.equal(fixture.calls.clockReads, 1);
        assert.deepEqual(
            (fixture.calls.writes[0] as { data: { acceptedAt: Date } }).data
                .acceptedAt,
            fixture.instant
        );
    } finally {
        await scope.dispose();
        await container.dispose();
    }
});
