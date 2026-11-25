import { createTaggingService } from "#/modules/tagging/Tagging.service.js";
import assert from "node:assert/strict";
import test from "node:test";

for (const dependency of [
    "children",
    "courseTags",
    "groupTags",
    "groupEventTags"
]) {
    test(`rejects deletion of tags used by ${dependency}`, async () => {
        let deleted = false;
        const service = createTaggingService({
            prisma: {
                tag: {
                    findUnique: async () => ({
                        _count: {
                            children: 0,
                            courseTags: 0,
                            groupTags: 0,
                            groupEventTags: 0,
                            [dependency]: 1
                        }
                    }),
                    delete: async () => {
                        deleted = true;
                    }
                }
            } as never
        });
        const result = await service.deleteTag(1);
        assert.equal(result.isErr(), true);
        assert.equal(deleted, false);
    });
}

test("deletes a tag without restrictive dependencies", async () => {
    let deleted = false;
    const service = createTaggingService({
        prisma: {
            tag: {
                findUnique: async () => ({
                    _count: {
                        children: 0,
                        courseTags: 0,
                        groupTags: 0,
                        groupEventTags: 0
                    }
                }),
                delete: async () => {
                    deleted = true;
                }
            }
        } as never
    });
    assert.equal((await service.deleteTag(1)).isOk(), true);
    assert.equal(deleted, true);
});
