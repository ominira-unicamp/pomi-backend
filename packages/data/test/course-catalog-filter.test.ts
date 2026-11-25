import IO, { coursePaths } from "#/modules/academic/course/Course.contract.js";
import { courseSqlWhere } from "#/modules/academic/course/Course.query.js";
import { parseStructuredQuery } from "@pomi/api-core";
import assert from "node:assert/strict";
import test from "node:test";

const parse = (filter: unknown) =>
    IO.list.request.parse({ query: { filter } }).query;

test("normalizes scalar catalog filters and preserves false, zero and literal text", () => {
    const query = parse({
        latestCatalogCourse: {
            finalExam: { eq: "false" },
            workload: { laboratoryHours: { gte: "0", isNull: "false" } },
            syllabus: { contains: " computação%_ " }
        }
    });
    assert.deepEqual(query.filter, [
        {
            path: ["latestCatalogCourse", "finalExam"],
            operator: "eq",
            values: ["false"]
        },
        {
            path: ["latestCatalogCourse", "workload", "laboratoryHours"],
            operator: "gte",
            values: [0]
        },
        {
            path: ["latestCatalogCourse", "workload", "laboratoryHours"],
            operator: "isNull",
            values: ["false"]
        },
        {
            path: ["latestCatalogCourse", "syllabus"],
            operator: "contains",
            values: ["computação%_"]
        }
    ]);
    const sql = courseSqlWhere(query.filter!);
    assert.ok(sql.values.includes(false));
    assert.ok(sql.values.includes("computação%_"));
    assert.ok(!sql.text.includes("computação"));
});

test("keeps predicate conditions together and excludes the matching item rather than different items", () => {
    const query = parse({
        latestCatalogCourse: {
            prerequisites: {
                some: [
                    { course: { courseCode: "MC102", fulfillment: "FULL" } },
                    {
                        specialRequirement: {
                            type: "PROGRESSION_COEFFICIENT",
                            progressionCoefficient: { value: { gte: "50" } }
                        }
                    }
                ],
                none: [{ course: { courseId: { in: ["1", "2"] } } }]
            }
        }
    });
    const sql = courseSqlWhere(query.filter!);
    assert.equal((sql.text.match(/EXISTS \(/g) ?? []).length, 3);
    assert.equal((sql.text.match(/NOT EXISTS/g) ?? []).length, 1);
    assert.deepEqual(sql.values, [
        "MC102",
        "FULL",
        "PROGRESSION_COEFFICIENT",
        50,
        1,
        2
    ]);
    const path = coursePaths.list(query);
    const url = new URL(path, "https://example.test");
    assert.equal(
        url.searchParams.get(
            "filter[latestCatalogCourse][prerequisites][some][0][course][courseCode]"
        ),
        "MC102"
    );
    assert.deepEqual(
        url.searchParams.getAll(
            "filter[latestCatalogCourse][prerequisites][none][0][course][courseId][in]"
        ),
        ["1", "2"]
    );
    assert.deepEqual(
        IO.list.request.parse({
            query: parseStructuredQuery(url.search.slice(1))
        }).query,
        query
    );
});

test("rejects invalid variants, empty collections, sparse indices and invalid scalar values", () => {
    for (const latestCatalogCourse of [
        {},
        { syllabus: { contains: " " } },
        { finalExam: "yes" },
        { minimumAttendancePercent: { gt: "101" } },
        { workload: { laboratoryHours: "-1" } },
        { catalogYear: { isNull: "true" } },
        { prerequisites: { some: [] } },
        { prerequisites: { some: [{}] } },
        {
            prerequisites: {
                some: [
                    {
                        course: {},
                        specialRequirement: { type: "AUTHORIZATION" }
                    }
                ]
            }
        },
        {
            prerequisites: {
                some: [
                    {
                        specialRequirement: {
                            type: "AUTHORIZATION",
                            progressionCoefficient: { value: "50" }
                        }
                    }
                ]
            }
        },
        {
            prerequisites: {
                some: [{ course: { courseCode: { ne: "MC102" } } }]
            }
        },
        {
            prerequisites: {
                some: Object.assign(new Array(2), {
                    1: { course: { courseId: "1" } }
                })
            }
        },
        {
            prerequisites: {
                some: [
                    {
                        specialRequirement: {
                            progressionCoefficient: { value: "50" }
                        }
                    }
                ]
            }
        }
    ])
        assert.equal(
            IO.list.request.safeParse({
                query: { filter: { latestCatalogCourse } }
            }).success,
            false,
            JSON.stringify(latestCatalogCourse)
        );
});

test("enforces total expression and predicate limits", () => {
    const course = { course: { courseCode: "MC102" } };
    assert.equal(
        IO.list.request.safeParse({
            query: {
                filter: {
                    latestCatalogCourse: {
                        prerequisites: {
                            some: Array(20).fill(course),
                            none: [course]
                        }
                    }
                }
            }
        }).success,
        false
    );
    assert.equal(
        IO.list.request.safeParse({
            query: {
                filter: {
                    latestCatalogCourse: {
                        catalogYear: { in: Array(101).fill("2025") }
                    }
                }
            }
        }).success,
        false
    );
});

test("accepts a single membership value on the wire and preserves indexed groups", () => {
    const query = parseStructuredQuery(
        "filter[latestCatalogCourse][prerequisites][some][0][course][courseCode][in]=MC102&filter[latestCatalogCourse][catalogYear][notIn]=2025"
    );
    const parsed = IO.list.request.parse({ query }).query;
    assert.deepEqual(
        parsed.filter?.find((item) => item.path.at(-1) === "courseCode")
            ?.values,
        ["MC102"]
    );
    assert.deepEqual(
        parsed.filter?.find((item) => item.path.at(-1) === "catalogYear")
            ?.values,
        [2025]
    );
    const sparse = parseStructuredQuery(
        "filter[latestCatalogCourse][prerequisites][some][1][course][courseCode]=MC102"
    );
    assert.equal(IO.list.request.safeParse({ query: sparse }).success, false);
});
