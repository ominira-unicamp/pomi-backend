import IO, {
    catalogCoursePaths
} from "#/modules/catalog/catalog-course/CatalogCourse.contract.js";
import { catalogCourseFilterWhere } from "#/modules/catalog/catalog-course/CatalogCourse.service.js";
import assert from "node:assert/strict";
import test from "node:test";

test("validates and coerces catalog course filters", () => {
    const parsed = IO.list.request.safeParse({
        query: {
            filter: {
                catalogYear: "2020",
                courseCode: { in: ["MC102", "MC202"] },
                unit: { code: "IC" },
                offeringPeriod: "ALL_PERIODS"
            }
        }
    });

    assert.equal(parsed.success, true);
    if (!parsed.success) return;
    assert.deepEqual(parsed.data.query.filter, [
        { path: ["catalogYear"], operator: "eq", values: [2020] },
        {
            path: ["courseCode"],
            operator: "in",
            values: ["MC102", "MC202"]
        },
        { path: ["unit", "code"], operator: "eq", values: ["IC"] },
        {
            path: ["offeringPeriod"],
            operator: "eq",
            values: ["ALL_PERIODS"]
        }
    ]);
});

test("rejects catalog course fields and operators outside the profile", () => {
    assert.equal(
        IO.list.request.safeParse({
            query: { filter: { name: { eq: "Cálculo" } } }
        }).success,
        false
    );
    assert.equal(
        IO.list.request.safeParse({
            query: { filter: { offeringPeriod: { ne: "ALL_PERIODS" } } }
        }).success,
        false
    );
});

test("compiles catalog course filters across relations", () => {
    assert.deepEqual(
        catalogCourseFilterWhere([
            { path: ["catalogYear"], operator: "eq", values: [2025] },
            { path: ["unit", "code"], operator: "eq", values: ["IC"] },
            {
                path: ["coordinatorId"],
                operator: "in",
                values: [10, 20]
            },
            {
                path: ["offeringPeriod"],
                operator: "eq",
                values: ["ALL_PERIODS"]
            }
        ]),
        [
            { catalog: { year: { equals: 2025 } } },
            { course: { unit: { code: { equals: "IC" } } } },
            { coordinatorId: { in: [10, 20] } },
            { offeringPeriod: { equals: "ALL_PERIODS" } }
        ]
    );
});

test("preserves catalog course filters in pagination paths", () => {
    const path = catalogCoursePaths.list({
        filter: [{ path: ["unit", "code"], operator: "eq", values: ["IC"] }],
        page: 2,
        pageSize: 10
    });
    const params = new URL(path, "https://pomi.test").searchParams;

    assert.equal(params.get("filter[unit][code]"), "IC");
    assert.equal(params.get("page"), "2");
    assert.equal(params.get("pageSize"), "10");
});

test("rejects the removed flat catalog course query parameters", () => {
    for (const query of [
        { catalogYear: "2025" },
        { courseCode: "MC102" },
        { unitCode: "IC" },
        { offeringPeriod: "ALL_PERIODS" }
    ]) {
        assert.equal(IO.list.request.safeParse({ query }).success, false);
    }
});
