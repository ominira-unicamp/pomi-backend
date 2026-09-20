import IO from "#/modules/student-tag-interest/StudentTagInterest.contract.js";
import { createStudentTagInterestService } from "#/modules/student-tag-interest/StudentTagInterest.service.js";
import assert from "node:assert/strict";
import test from "node:test";

test("declares private student tag interest paths", () => {
    assert.deepEqual(IO.list.meta.path, [
        { type: "literal", value: "student" },
        { type: "param", name: "sid" },
        { type: "literal", value: "tag-interests" }
    ]);
    assert.equal(
        IO.put.request.safeParse({
            path: { sid: "7", tagId: "8" }
        }).success,
        true
    );
});

test("lists interests sorted by tag name", async () => {
    const service = createStudentTagInterestService({
        prisma: {
            studentTagInterest: {
                findMany: async () => [
                    {
                        tag: {
                            id: 8,
                            name: "Zoologia",
                            categoryId: 1,
                            parentTagId: null
                        }
                    },
                    {
                        tag: {
                            id: 9,
                            name: "Álgebra",
                            categoryId: 1,
                            parentTagId: null
                        }
                    }
                ]
            }
        } as never
    });

    assert.deepEqual(await service.list(7), [
        { id: 9, name: "Álgebra", categoryId: 1, parentTagId: null },
        { id: 8, name: "Zoologia", categoryId: 1, parentTagId: null }
    ]);
});

test("upserts existing tags and rejects unknown tags", async () => {
    let upsertInput: unknown;
    const service = createStudentTagInterestService({
        prisma: {
            tag: {
                findUnique: async ({ where }: { where: { id: number } }) =>
                    where.id === 8 ? { id: 8 } : null
            },
            studentTagInterest: {
                upsert: async (input: unknown) => {
                    upsertInput = input;
                }
            }
        } as never
    });

    assert.equal((await service.put(7, 8)).isOk(), true);
    assert.deepEqual(upsertInput, {
        where: { studentId_tagId: { studentId: 7, tagId: 8 } },
        create: { studentId: 7, tagId: 8 },
        update: {}
    });
    assert.equal((await service.put(7, 99)).isErr(), true);
});
