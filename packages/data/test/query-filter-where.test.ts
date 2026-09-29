import {
    compileFilterWhere,
    prismaWhereFor,
    scalarFilter
} from "@pomi/api-core";
import assert from "node:assert/strict";
import test from "node:test";

test("converts every supported scalar filter operator", () => {
    assert.deepEqual(scalarFilter("eq", ["4"], Number), { equals: 4 });
    assert.deepEqual(scalarFilter("ne", ["4"], Number), { not: 4 });
    assert.deepEqual(scalarFilter("in", ["2", "4"], Number), {
        in: [2, 4]
    });
    assert.deepEqual(scalarFilter("gt", ["4"], Number), { gt: 4 });
    assert.deepEqual(scalarFilter("gte", ["4"], Number), { gte: 4 });
    assert.deepEqual(scalarFilter("lt", ["4"], Number), { lt: 4 });
    assert.deepEqual(scalarFilter("lte", ["4"], Number), { lte: 4 });
});

test("dispatches filter expressions through resource definitions", () => {
    const where = compileFilterWhere<Record<string, unknown>>(
        [
            { path: ["code"], operator: "eq", values: ["MC102"] },
            { path: ["credits"], operator: "gte", values: [4] }
        ],
        {
            code: (expression) => ({
                code: scalarFilter(
                    expression.operator,
                    expression.values,
                    String
                )
            }),
            credits: (expression) => ({
                credits: scalarFilter(
                    expression.operator,
                    expression.values,
                    Number
                )
            })
        },
        "course"
    );

    assert.deepEqual(where, [
        { code: { equals: "MC102" } },
        { credits: { gte: 4 } }
    ]);
});

test("reports an unsupported resource filter path", () => {
    assert.throws(
        () =>
            compileFilterWhere(
                [{ path: ["name"], operator: "eq", values: ["dados"] }],
                {},
                "course"
            ),
        new Error("Unsupported course filter: name")
    );
});

type ExampleWhere = {
    credits?: number | { equals?: number };
    course?: {
        code?: string | { equals?: string };
        period?: "FIRST" | "SECOND" | { equals?: "FIRST" | "SECOND" };
    };
    tags?: {
        some?: {
            id?: number | { equals?: number };
        };
    };
};

test("builds nested Prisma where inputs from typed scalar paths", () => {
    const where = prismaWhereFor<ExampleWhere>();

    assert.deepEqual(
        where.numberAt("tags.some.id")({
            path: ["tagId"],
            operator: "in",
            values: [2, 4]
        }),
        { tags: { some: { id: { in: [2, 4] } } } }
    );
    assert.deepEqual(
        where.stringAt("course.code")({
            path: ["courseCode"],
            operator: "eq",
            values: ["MC102"]
        }),
        { course: { code: { equals: "MC102" } } }
    );
    assert.deepEqual(
        where.enumAt("course.period")({
            path: ["period"],
            operator: "ne",
            values: ["FIRST"]
        }),
        { course: { period: { not: "FIRST" } } }
    );
});

test("rejects unsafe Prisma where path segments", () => {
    const where = prismaWhereFor<ExampleWhere>();

    assert.throws(
        () => where.numberAt("tags.__proto__.id" as never),
        new Error("Invalid Prisma where path: tags.__proto__.id")
    );
});
