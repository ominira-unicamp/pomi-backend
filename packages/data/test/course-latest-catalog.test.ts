import IO from "#/modules/academic/course/Course.contract.js";
import courseEntity from "#/modules/academic/course/Course.entity.js";
import assert from "node:assert/strict";
import test from "node:test";

test("always exposes latestCatalogCourse and strips persistence relations", () => {
    const course = courseEntity.build({
        id: 10,
        code: "MC102",
        name: "Algoritmos",
        credits: 6,
        unitId: 1,
        unit: { code: "IC" },
        catalogCourses: []
    });

    assert.deepEqual(course, {
        id: 10,
        code: "MC102",
        name: "Algoritmos",
        credits: 6,
        prefix: "MC",
        unitId: 1,
        unitCode: "IC",
        latestCatalogCourse: null
    });
    assert.equal(IO.schema.safeParse(course).success, true);
    const { latestCatalogCourse: _latest, ...withoutLatest } = course;
    assert.equal(IO.schema.safeParse(withoutLatest).success, false);
    assert.equal(
        IO.schema.safeParse({ ...course, latestCatalogCourse: {} }).success,
        false
    );
});

test("does not introduce filters on latestCatalogCourse", () => {
    assert.equal(
        IO.list.request.safeParse({
            query: { filter: { latestCatalogCourse: { catalogYear: 2026 } } }
        }).success,
        false
    );
});
