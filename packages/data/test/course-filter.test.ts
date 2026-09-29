import IO, { coursePaths } from "#/modules/academic/course/Course.contract.js";
import {
    courseFilterWhere,
    createCourseService
} from "#/modules/academic/course/Course.service.js";
import { ZodToApiError } from "@pomi/api-core";
import assert from "node:assert/strict";
import test from "node:test";

test("validates and coerces the public course filter", () => {
    const parsed = IO.list.request.safeParse({
        query: {
            filter: {
                credits: { gte: "4", lte: "8" },
                unit: { code: "IC" }
            }
        }
    });

    assert.equal(parsed.success, true);
    if (!parsed.success) return;
    assert.deepEqual(parsed.data.query.filter, [
        { path: ["credits"], operator: "gte", values: [4] },
        { path: ["credits"], operator: "lte", values: [8] },
        { path: ["unit", "code"], operator: "eq", values: ["IC"] }
    ]);
});

test("rejects course fields and operators outside the resource profile", () => {
    const unsupportedField = IO.list.request.safeParse({
        query: { filter: { name: { eq: "dados" } } }
    });
    assert.equal(unsupportedField.success, false);
    if (!unsupportedField.success) {
        assert.equal(
            unsupportedField.error.issues[0]?.message,
            'O campo "name" não é aceito neste endpoint. Campos aceitos: catalogYear, code, credits, tagId, unit.code, unit.id.'
        );
        assert.equal(
            ZodToApiError(unsupportedField.error)[0]?.code,
            "FILTER_FIELD_UNSUPPORTED"
        );
    }

    const unsupportedOperator = IO.list.request.safeParse({
        query: { filter: { credits: { ge: "4" } } }
    });
    assert.equal(unsupportedOperator.success, false);
    if (!unsupportedOperator.success) {
        assert.equal(
            unsupportedOperator.error.issues[0]?.message,
            'O operador "ge" não é aceito para o campo "credits". Você quis dizer "gte"? Operadores aceitos: eq, ne, gt, gte, lt, lte, in.'
        );
        assert.deepEqual(ZodToApiError(unsupportedOperator.error)[0], {
            code: "FILTER_OPERATOR_UNSUPPORTED",
            path: ["query", "filter", "0", "credits", "ge"],
            message:
                'O operador "ge" não é aceito para o campo "credits". Você quis dizer "gte"? Operadores aceitos: eq, ne, gt, gte, lt, lte, in.',
            details: {
                resource: "courses",
                field: "credits",
                receivedOperator: "ge",
                allowedOperators: ["eq", "ne", "gt", "gte", "lt", "lte", "in"],
                suggestion: "gte"
            }
        });
    }

    assert.equal(
        IO.list.request.safeParse({
            query: { filter: { unit: { code: { gte: "IC" } } } }
        }).success,
        false
    );
});

test("compiles course filters to Prisma where clauses", () => {
    assert.deepEqual(
        courseFilterWhere([
            { path: ["code"], operator: "eq", values: ["MC202"] },
            { path: ["credits"], operator: "gte", values: [4] },
            { path: ["unit", "code"], operator: "eq", values: ["IC"] },
            { path: ["tagId"], operator: "in", values: [1, 2] }
        ]),
        [
            { code: { equals: "MC202" } },
            { credits: { gte: 4 } },
            { unit: { code: { equals: "IC" } } },
            { courseTags: { some: { tagId: { in: [1, 2] } } } }
        ]
    );
});

test("preserves normalized filters in paginated resource paths", () => {
    const path = coursePaths.list({
        filter: [
            { path: ["credits"], operator: "gte", values: [4] },
            { path: ["unit", "code"], operator: "eq", values: ["IC"] }
        ],
        page: 2,
        pageSize: 10
    });
    const params = new URL(path, "https://pomi.test").searchParams;

    assert.equal(params.get("filter[credits][gte]"), "4");
    assert.equal(params.get("filter[unit][code]"), "IC");
    assert.equal(params.get("page"), "2");
    assert.equal(params.get("pageSize"), "10");
});

test("combines multiple public course filters", async () => {
    let countWhere: unknown;
    let findManyWhere: unknown;
    const service = createCourseService({
        prisma: {
            course: {
                count: async ({ where }: { where: unknown }) => {
                    countWhere = where;
                    return 0;
                },
                findMany: async ({ where }: { where: unknown }) => {
                    findManyWhere = where;
                    return [];
                }
            }
        } as never
    });

    const query = IO.list.request.parse({
        query: {
            filter: { credits: { gte: "4" }, unit: { code: "IC" } }
        }
    }).query;
    await service.list(query);

    assert.deepEqual(countWhere, findManyWhere);
    assert.deepEqual(countWhere, {
        AND: [{ credits: { gte: 4 } }, { unit: { code: { equals: "IC" } } }]
    });
});

test("rejects the removed flat course query parameters", () => {
    for (const query of [
        { unitCode: "IC" },
        { courseCode: "MC102" },
        { catalogYear: "2025" },
        { tagId: "1" },
        { q: "dados" }
    ]) {
        assert.equal(IO.list.request.safeParse({ query }).success, false);
    }
});
