import IO, {
    catalogCoursePaths
} from "#/modules/catalog/catalog-course/CatalogCourse.contract.js";
import {
    catalogCourseFilterWhere,
    createCatalogCourseService
} from "#/modules/catalog/catalog-course/CatalogCourse.service.js";
import assert from "node:assert/strict";
import test from "node:test";

test("expõe pré-requisitos sem códigos textuais", () => {
    const result = IO.schema.safeParse({
        id: 1,
        catalogId: 1,
        catalogYear: 2026,
        courseId: 10,
        code: "MC102",
        name: "Cálculo I",
        credits: 6,
        coordinator: null,
        workload: {
            theoreticalHours: null,
            practicalHours: null,
            laboratoryHours: null,
            guidedActivityHours: null,
            distanceHours: null,
            guidedExtensionHours: null,
            practicalExtensionHours: null,
            weeks: null,
            weeklyClassHours: null,
            classroomHours: null
        },
        offeringPeriod: null,
        evaluation: null,
        finalExam: null,
        minimumAttendancePercent: null,
        syllabus: null,
        bibliography: null,
        sourceUrl: null,
        prerequisites: {
            any: [
                {
                    all: [
                        { courseId: 20, fulfillment: "FULL" },
                        {
                            specialRequirementType: "PROGRESSION_COEFFICIENT",
                            specialRequirementValue: 30
                        }
                    ]
                }
            ]
        },
        _paths: {
            self: "/catalog-courses/1",
            catalog: "/catalogs/1",
            course: "/courses/10",
            coordinator: null
        }
    });

    assert.equal(result.success, true);
});

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

test("parses catalog course sorting in client priority order", () => {
    const parsed = IO.list.request.parse({
        query: { sort: "credits:desc,code:asc" }
    });
    assert.deepEqual(parsed.query.sort, [
        { field: "credits", direction: "desc" },
        { field: "code", direction: "asc" }
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

test("preserves catalog course sorting in pagination paths", () => {
    const path = catalogCoursePaths.list({
        sort: [
            { field: "credits", direction: "desc" },
            { field: "code", direction: "asc" }
        ],
        page: 2,
        pageSize: 10
    });
    assert.equal(
        new URL(path, "https://pomi.test").searchParams.get("sort"),
        "credits:desc,code:asc"
    );
});

test("compiles catalog course sorting before Prisma pagination", async () => {
    const queries: unknown[] = [];
    const service = createCatalogCourseService({
        prisma: {
            catalogCourse: {
                count: async () => 0,
                findMany: async (query: unknown) => {
                    queries.push(query);
                    return [];
                }
            }
        } as never
    });

    await service.list({
        page: 2,
        pageSize: 10,
        sort: [
            { field: "credits", direction: "desc" },
            { field: "name", direction: "asc" }
        ]
    });
    await service.list({});

    assert.deepEqual(
        queries[0] as { orderBy: unknown; skip: number; take: number },
        {
            include: {
                catalog: { select: { id: true, year: true } },
                course: { select: { id: true, code: true, credits: true } },
                coordinator: { select: { id: true, name: true } },
                prerequisites: {
                    include: {
                        items: {
                            select: {
                                courseId: true,
                                fulfillment: true,
                                specialRequirementType: true,
                                specialRequirementValue: true
                            }
                        }
                    }
                }
            },
            orderBy: [
                { course: { credits: "desc" } },
                { name: "asc" },
                { id: "asc" }
            ],
            skip: 10,
            take: 10,
            where: {}
        }
    );
    assert.deepEqual((queries[1] as { orderBy: unknown }).orderBy, [
        { catalog: { year: "desc" } },
        { course: { code: "asc" } },
        { id: "asc" }
    ]);
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
