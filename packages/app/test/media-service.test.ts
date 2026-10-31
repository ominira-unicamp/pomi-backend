import {
    createAppImageResourceRegistry,
    studentAvatarResource
} from "#/MediaResources.js";
import { ImageResourceRegistry } from "#/media/ImageResourceRegistry.js";
import { createMediaService } from "#/media/MediaService.js";
import {
    MediaUploadLimiter,
    MediaUploadRateLimitError
} from "#/media/MediaUploadLimiter.js";
import { defineImageResource, imageProfiles } from "#/media/public.js";
import {
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ServiceUnavailableError
} from "@pomi/api-core";
import assert from "node:assert/strict";
import test from "node:test";
import { mediaFixture, principal, upload, uploaded } from "./fixtures/media.js";

const target = { studentId: 42 };
const groupTarget = { groupId: 7, studentId: 42 };

test("replacement advances the slot revision and queues only the prior alias", async () => {
    const fixture = mediaFixture();
    assert.deepEqual(
        await fixture.studentAvatars.replace({
            actor: principal,
            target,
            upload: upload()
        }),
        { mediaId: "created-1", revision: 4 }
    );
    assert.equal(fixture.state().student.avatarMediaId, "created-1");
    assert.equal(fixture.state().assets["old-id"].status, "PENDING_DELETE");
    assert.ok(fixture.state().assets["old-id"].nextDeleteAt instanceof Date);
    assert.equal(fixture.state().assets["old-group-id"].status, "ACTIVE");
});

test("failed activation is compensated without retiring a linked alias", async () => {
    const fixture: ReturnType<typeof mediaFixture> = mediaFixture({
        upload: async () => {
            fixture.state().userStatus = "DISABLED";
            return { ...uploaded, alias: "old.webp" };
        }
    });
    await assert.rejects(
        fixture.studentAvatars.replace({
            actor: principal,
            target,
            upload: upload()
        }),
        ForbiddenError
    );
    assert.equal(fixture.state().assets["old-id"].status, "ACTIVE");
    assert.equal(fixture.state().created, 0);
});

test("a stale upload cannot replace a newer image and is recorded for cleanup", async () => {
    const fixture: ReturnType<typeof mediaFixture> = mediaFixture({
        upload: async () => {
            fixture.state().student.avatarMediaId = "newer-id";
            fixture.state().student.avatarRevision += 1;
            return uploaded;
        }
    });
    await assert.rejects(
        fixture.studentAvatars.replace({
            actor: principal,
            target,
            upload: upload()
        }),
        ConflictError
    );
    assert.equal(fixture.state().student.avatarMediaId, "newer-id");
    assert.equal(fixture.state().assets["created-1"].status, "PENDING_DELETE");
    assert.equal(fixture.state().assets["old-id"].status, "ACTIVE");
});

test("revoked permission during upload leaves the active image intact", async () => {
    const fixture: ReturnType<typeof mediaFixture> = mediaFixture({
        upload: async () => {
            fixture.state().userStatus = "DISABLED";
            return uploaded;
        }
    });
    await assert.rejects(
        fixture.studentAvatars.replace({
            actor: principal,
            target,
            upload: upload()
        }),
        ForbiddenError
    );
    assert.equal(fixture.state().student.avatarMediaId, "old-id");
    assert.equal(fixture.state().assets["old-id"].status, "ACTIVE");
    assert.equal(fixture.state().assets["created-1"].status, "PENDING_DELETE");
});

test("group editing is rechecked and archived groups cannot activate images", async () => {
    for (const archived of [false, true]) {
        const fixture: ReturnType<typeof mediaFixture> = mediaFixture({
            upload: async () => {
                if (archived) fixture.state().groupStatus = "ARCHIVED";
                else fixture.state().canEditGroup = false;
                return uploaded;
            }
        });
        await assert.rejects(
            fixture.groupAvatars.replace({
                actor: principal,
                target: groupTarget,
                upload: upload()
            }),
            archived ? NotFoundError : ForbiddenError
        );
        assert.equal(fixture.state().group.avatarMediaId, "old-group-id");
    }
});

test("removal detaches before scheduling physical deletion and does not require storage", async () => {
    const fixture = mediaFixture();
    const service = createMediaService({
        prisma: fixture.database,
        imageResourceRegistry: fixture.registry,
        imageStorage: undefined,
        mediaUploadLimiter: new MediaUploadLimiter(2)
    });
    assert.deepEqual(
        await service
            .forResource(studentAvatarResource)
            .remove({ actor: principal, target }),
        { revision: 4 }
    );
    assert.equal(fixture.state().student.avatarMediaId, null);
    assert.equal(fixture.state().assets["old-id"].status, "PENDING_DELETE");
    await assert.rejects(
        service
            .forResource(studentAvatarResource)
            .replace({ actor: principal, target, upload: upload() }),
        ServiceUnavailableError
    );
});

test("read access follows the current profile flag and current identity", async () => {
    const fixture = mediaFixture();
    const read = (actor = principal) =>
        fixture.service.read(
            actor,
            "old-id",
            "avatarSmall",
            new AbortController().signal
        );
    await assert.rejects(
        fixture.service.read(
            undefined,
            "old-id",
            "avatarSmall",
            new AbortController().signal
        ),
        NotFoundError
    );
    assert.ok(await read());
    fixture.state().userStatus = "DISABLED";
    await assert.rejects(read(), NotFoundError);
    fixture.state().publicProfileEnabled = true;
    assert.ok(
        await fixture.service.read(
            undefined,
            "old-id",
            "avatarSmall",
            new AbortController().signal
        )
    );
});

test("only an active singly linked asset exposes a group avatar", async () => {
    const fixture = mediaFixture();
    const read = () =>
        fixture.service.read(
            undefined,
            "old-group-id",
            "avatarLarge",
            new AbortController().signal
        );
    assert.ok(await read());
    fixture.state().student.avatarMediaId = "old-group-id";
    await assert.rejects(read(), NotFoundError);
    fixture.state().student.avatarMediaId = null;
    fixture.state().groupStatus = "ARCHIVED";
    await assert.rejects(read(), NotFoundError);
    fixture.state().groupStatus = "ACTIVE";
    fixture.state().assets["old-group-id"].status = "PENDING_DELETE";
    await assert.rejects(read(), NotFoundError);
    fixture.state().assets["old-group-id"].status = "ACTIVE";
    fixture.state().group.avatarMediaId = null;
    await assert.rejects(read(), NotFoundError);
});

test("bot grants and current administrator roles govern private student access", async () => {
    const fixture = mediaFixture();
    fixture.state().userStudentId = 99;
    fixture.state().userRoles = ["BOT"];
    await assert.rejects(
        fixture.studentAvatars.remove({ actor: principal, target }),
        ForbiddenError
    );
    fixture.state().grant = true;
    assert.ok(
        await fixture.service.read(
            principal,
            "old-id",
            "avatarSmall",
            new AbortController().signal
        )
    );
    fixture.state().grant = false;
    await assert.rejects(
        fixture.service.read(
            principal,
            "old-id",
            "avatarSmall",
            new AbortController().signal
        ),
        NotFoundError
    );
    fixture.state().userRoles = ["ADMIN"];
    assert.ok(
        await fixture.studentAvatars.remove({ actor: principal, target })
    );
});

test("generic resource operations use the transaction for revalidation and roll back attachment failure", async () => {
    const fixture = mediaFixture();
    let inside = false;
    const calls: boolean[] = [];
    const original = fixture.database.$transaction.bind(fixture.database);
    fixture.database.$transaction = (async (
        work: (db: unknown) => Promise<unknown>
    ) =>
        original(async (tx) => {
            inside = true;
            assert.notEqual(tx, undefined);
            const transaction = new Proxy(tx, {});
            try {
                return await work(transaction);
            } finally {
                inside = false;
            }
        })) as typeof fixture.database.$transaction;
    const resource = defineImageResource<{ id: number }, never>({
        key: "fictional-resource",
        profile: imageProfiles.avatar,
        authorizeWrite: async ({ db }) => {
            calls.push(inside);
            if (inside) assert.notEqual(db, fixture.database);
            else assert.equal(db, fixture.database);
        },
        loadSlot: async () => ({ mediaId: "old-id", revision: 3 }),
        compareAndSetSlot: async () => false,
        findReferences: async () => [],
        authorizeRead: async () => false
    });
    const service = createMediaService({
        prisma: fixture.database,
        imageResourceRegistry: new ImageResourceRegistry([resource]),
        imageStorage: fixture.storage,
        mediaUploadLimiter: new MediaUploadLimiter(2)
    });
    await assert.rejects(
        service
            .forResource(resource)
            .replace({ actor: principal, target: { id: 1 }, upload: upload() }),
        ConflictError
    );
    assert.deepEqual(calls, [false, true]);
    assert.equal(fixture.state().created, 1);
    assert.equal(fixture.state().assets["created-1"].status, "PENDING_DELETE");
    assert.equal(fixture.state().assets["old-id"].status, "ACTIVE");
});

test("registry rejects duplicate and unregistered resources", async () => {
    assert.throws(
        () =>
            new ImageResourceRegistry([
                studentAvatarResource,
                studentAvatarResource
            ]),
        /duplicado/
    );
    assert.throws(() => new ImageResourceRegistry([]), /Nenhum/);
    assert.throws(
        () =>
            createAppImageResourceRegistry().assertRegistered({
                ...studentAvatarResource
            }),
        /não registrado/
    );
});

test("upload admissions are released on storage failure, activation failure and cancellation", async () => {
    const limiter = new MediaUploadLimiter(1, 100);
    let mode = "fail";
    const fixture = mediaFixture(
        {
            upload: async (input) => {
                if (input.signal.aborted) throw new Error("cancelled");
                if (mode === "fail") throw new Error("upstream");
                return uploaded;
            }
        },
        limiter
    );
    await assert.rejects(
        fixture.studentAvatars.replace({
            actor: principal,
            target,
            upload: upload()
        }),
        /upstream/
    );
    mode = "success";
    const cancelled = upload();
    cancelled.signal = AbortSignal.abort();
    await assert.rejects(
        fixture.studentAvatars.replace({
            actor: principal,
            target,
            upload: cancelled
        }),
        /cancelled/
    );
    assert.ok(
        await fixture.studentAvatars.replace({
            actor: principal,
            target,
            upload: upload()
        })
    );
    fixture.state().userStatus = "ACTIVE";
    const release = limiter.acquire(9);
    assert.throws(() => limiter.acquire(9), MediaUploadRateLimitError);
    release();
});

test("group replacement and removal use their configured slot", async () => {
    const fixture = mediaFixture();
    assert.deepEqual(
        await fixture.groupAvatars.replace({
            actor: principal,
            target: groupTarget,
            upload: upload()
        }),
        { mediaId: "created-1", revision: 8 }
    );
    assert.equal(fixture.state().group.avatarMediaId, "created-1");
    assert.equal(
        fixture.state().assets["old-group-id"].status,
        "PENDING_DELETE"
    );
    assert.deepEqual(
        await fixture.groupAvatars.remove({
            actor: principal,
            target: groupTarget
        }),
        { revision: 9 }
    );
    assert.equal(fixture.state().assets["created-1"].status, "PENDING_DELETE");
    assert.equal(fixture.state().student.avatarMediaId, "old-id");
});

test("retirement failure rolls back the slot and records the uploaded image for cleanup", async () => {
    const fixture = mediaFixture();
    fixture.state().assets["old-id"].status = "DELETED";
    await assert.rejects(
        fixture.studentAvatars.replace({
            actor: principal,
            target,
            upload: upload()
        }),
        ConflictError
    );
    assert.deepEqual(fixture.state().student, {
        avatarMediaId: "old-id",
        avatarRevision: 3
    });
    assert.equal(fixture.state().assets["created-1"].status, "PENDING_DELETE");
});

test("compensation failure preserves the activation error and releases admission", async () => {
    const limiter = new MediaUploadLimiter(1, 100);
    const fixture: ReturnType<typeof mediaFixture> = mediaFixture(
        {
            upload: async () => {
                fixture.state().userStatus = "DISABLED";
                return uploaded;
            }
        },
        limiter
    );
    fixture.database.mediaAsset.create = (() => {
        throw new Error("compensation failed");
    }) as typeof fixture.database.mediaAsset.create;
    await assert.rejects(
        fixture.studentAvatars.replace({
            actor: principal,
            target,
            upload: upload()
        }),
        ForbiddenError
    );
    const release = limiter.acquire(9);
    release();
    assert.equal(fixture.state().student.avatarMediaId, "old-id");
});

test("serializable conflicts preserve the HTTP conflict classification", async () => {
    const fixture = mediaFixture();
    fixture.database.$transaction = (() =>
        Promise.reject({
            code: "P2034"
        })) as typeof fixture.database.$transaction;
    await assert.rejects(
        fixture.studentAvatars.replace({
            actor: principal,
            target,
            upload: upload()
        }),
        ConflictError
    );
    assert.equal(fixture.state().assets["created-1"].status, "PENDING_DELETE");
});
