import IO, {
    classSchedulePaths
} from "#/modules/schedule/class-schedule/ClassSchedule.contract.js";
import { classScheduleFilterWhere } from "#/modules/schedule/class-schedule/ClassSchedule.service.js";
import assert from "node:assert/strict";
import test from "node:test";

test("validates and coerces nested class schedule filters", () => {
    const parsed = IO.list.request.safeParse({
        query: {
            filter: {
                course: { code: "MC102" },
                studyPeriod: { year: "2025" },
                dayOfWeek: { in: ["MONDAY", "WEDNESDAY"] }
            }
        }
    });

    assert.equal(parsed.success, true);
    if (!parsed.success) return;
    assert.deepEqual(parsed.data.query.filter, [
        { path: ["course", "code"], operator: "eq", values: ["MC102"] },
        {
            path: ["studyPeriod", "year"],
            operator: "eq",
            values: [2025]
        },
        {
            path: ["dayOfWeek"],
            operator: "in",
            values: ["MONDAY", "WEDNESDAY"]
        }
    ]);
});

test("rejects class schedule fields and operators outside the profile", () => {
    assert.equal(
        IO.list.request.safeParse({
            query: { filter: { course: { name: { eq: "Cálculo" } } } }
        }).success,
        false
    );
    assert.equal(
        IO.list.request.safeParse({
            query: { filter: { dayOfWeek: { gte: "MONDAY" } } }
        }).success,
        false
    );
});

test("compiles class schedule filters through nested Prisma relations", () => {
    assert.deepEqual(
        classScheduleFilterWhere([
            { path: ["room", "code"], operator: "eq", values: ["PB01"] },
            {
                path: ["course", "code"],
                operator: "eq",
                values: ["MC102"]
            },
            {
                path: ["studyPeriod", "year"],
                operator: "in",
                values: [2024, 2025]
            }
        ]),
        [
            { room: { code: { equals: "PB01" } } },
            { class: { course: { code: { equals: "MC102" } } } },
            { class: { studyPeriod: { year: { in: [2024, 2025] } } } }
        ]
    );
});

test("preserves class schedule filters in pagination paths", () => {
    const path = classSchedulePaths.list({
        filter: [
            {
                path: ["course", "code"],
                operator: "eq",
                values: ["MC102"]
            }
        ],
        page: 2,
        pageSize: 10
    });
    const params = new URL(path, "https://pomi.test").searchParams;

    assert.equal(params.get("filter[course][code]"), "MC102");
    assert.equal(params.get("page"), "2");
    assert.equal(params.get("pageSize"), "10");
});

test("rejects the removed flat class schedule query parameters", () => {
    for (const query of [
        { roomId: "1" },
        { courseCode: "MC102" },
        { studyPeriodYear: "2025" },
        { dayOfWeek: "MONDAY" }
    ]) {
        assert.equal(IO.list.request.safeParse({ query }).success, false);
    }
});
