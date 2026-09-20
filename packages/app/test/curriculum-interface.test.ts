import IO from "#/modules/planning/curriculum/Curriculum.contract.js";
import assert from "node:assert/strict";
import test from "node:test";

test("accepts a curriculum with allocated and unallocated courses", () => {
    const result = IO.patch.request.safeParse({
        path: { sid: "7", id: "3" },
        body: {
            name: "Plano de conclusão",
            selection: {
                catalogProgramId: 10,
                specializationId: null,
                languageId: 4
            },
            periods: {
                add: [{ position: 1 }],
                update: [{ id: 8, position: 2 }],
                remove: [9]
            },
            courses: {
                upsert: [
                    { courseId: 20, periodId: 8 },
                    { courseId: 21, periodId: null }
                ],
                remove: [22]
            }
        }
    });

    assert.equal(result.success, true);
});

test("declares curriculum CRUD paths and summary-free entity fields", () => {
    assert.equal(IO.create.meta.method, "post");
    assert.equal(IO.patch.meta.method, "patch");
    assert.deepEqual(IO.patch.meta.path, [
        { type: "literal", value: "student" },
        { type: "param", name: "sid" },
        { type: "literal", value: "curricula" },
        { type: "param", name: "id" }
    ]);
    assert.equal(IO.schema.safeParse({}).success, false);
});
