import { acceptFriendship } from "#/modules/social/friendship/AcceptFriendship.use-case.js";
import assert from "node:assert/strict";
import test from "node:test";
import { friendshipFixture } from "./fixtures/friendship.js";

const input = { userId: 7, friendshipId: 3 };

test("friendship acceptance rejects invalid requests before writing or reading the clock", async (t) => {
    const scenarios: {
        name: string;
        setup(fixture: ReturnType<typeof friendshipFixture>): void;
        userId: number;
        kind: "not-found" | "cannot-accept";
    }[] = [
        {
            name: "absent",
            setup: (fixture) => {
                fixture.state.existing = null;
            },
            userId: 7,
            kind: "not-found"
        },
        {
            name: "nonparticipant",
            setup: () => {},
            userId: 9,
            kind: "not-found"
        },
        {
            name: "requester",
            setup: () => {},
            userId: 8,
            kind: "cannot-accept"
        },
        {
            name: "already accepted requester",
            setup: (fixture) => {
                fixture.row.status = "ACCEPTED";
            },
            userId: 8,
            kind: "cannot-accept"
        },
        {
            name: "already accepted",
            setup: (fixture) => {
                fixture.row.status = "ACCEPTED";
            },
            userId: 7,
            kind: "cannot-accept"
        }
    ];
    for (const scenario of scenarios)
        await t.test(scenario.name, async () => {
            const fixture = friendshipFixture();
            scenario.setup(fixture);
            const result = await acceptFriendship(fixture, {
                ...input,
                userId: scenario.userId
            });
            assert.deepEqual(result._unsafeUnwrapErr(), {
                kind: scenario.kind
            });
            assert.equal(fixture.calls.writes.length, 0);
            assert.equal(fixture.calls.reads.length, 0);
            assert.equal(fixture.calls.clockReads, 0);
        });
});

test("friendship acceptance retains participant checks and uses the injected instant in the conditional write", async () => {
    const fixture = friendshipFixture();
    const result = await acceptFriendship(fixture, input);
    assert.deepEqual(fixture.calls.finds, [
        {
            where: { id: 3, OR: [{ userAId: 7 }, { userBId: 7 }] },
            select: { status: true, requestedByUserId: true }
        }
    ]);
    assert.deepEqual(fixture.calls.writes, [
        {
            where: {
                id: 3,
                status: "PENDING",
                requestedByUserId: { not: 7 },
                OR: [{ userAId: 7 }, { userBId: 7 }]
            },
            data: { status: "ACCEPTED", acceptedAt: fixture.instant }
        }
    ]);
    assert.equal(fixture.calls.clockReads, 1);
    assert.equal(fixture.calls.reads.length, 1);
    const friendship = result._unsafeUnwrap();
    assert.equal(friendship.direction, "NONE");
    assert.equal(friendship.acceptedAt, fixture.instant.toISOString());
});

test("a lost conditional update reports a local conflict and skips the final read", async () => {
    const fixture = friendshipFixture();
    fixture.state.changedCount = 0;
    const result = await acceptFriendship(fixture, input);
    assert.deepEqual(result._unsafeUnwrapErr(), { kind: "concurrent-change" });
    assert.equal(fixture.calls.reads.length, 0);
    assert.equal(fixture.calls.clockReads, 1);
});

test("friendship acceptance preserves absence after a completed write without repeating it", async () => {
    const fixture = friendshipFixture();
    fixture.state.finalRow = null;
    const result = await acceptFriendship(fixture, input);
    assert.deepEqual(result._unsafeUnwrapErr(), { kind: "not-found" });
    assert.equal(fixture.calls.writes.length, 1);
    assert.equal(fixture.calls.reads.length, 1);
});

test("friendship acceptance propagates unexpected persistence failures", async (t) => {
    for (const stage of ["findError", "writeError", "finalReadError"] as const)
        await t.test(stage, async () => {
            const fixture = friendshipFixture();
            const failure = new Error("database unavailable");
            fixture.state[stage] = failure;
            await assert.rejects(
                acceptFriendship(fixture, input),
                (error) => error === failure
            );
            assert.ok(fixture.calls.writes.length <= 1);
        });
});
