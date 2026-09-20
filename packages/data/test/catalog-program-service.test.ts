import assert from "node:assert/strict";
import test from "node:test";

import IO from "#/modules/catalog/catalog-program/CatalogProgram.contract.js";
import {
    catalogProgramFilterWhere,
    createCatalogProgramService
} from "#/modules/catalog/catalog-program/CatalogProgram.service.js";

test("validates and coerces catalog program filters", () => {
    const parsed = IO.list.request.safeParse({
        query: {
            filter: {
                catalogYear: "2025",
                programCode: { in: ["34", "51"] }
            }
        }
    });

    assert.equal(parsed.success, true);
    if (!parsed.success) return;
    assert.deepEqual(parsed.data.query.filter, [
        { path: ["catalogYear"], operator: "eq", values: [2025] },
        { path: ["programCode"], operator: "in", values: [34, 51] }
    ]);
});

test("compiles catalog program filters across relations", () => {
    assert.deepEqual(
        catalogProgramFilterWhere([
            { path: ["catalogId"], operator: "eq", values: [12] },
            { path: ["catalogYear"], operator: "eq", values: [2025] },
            { path: ["programCode"], operator: "in", values: [34, 51] }
        ]),
        [
            { catalogId: { equals: 12 } },
            { catalog: { year: { equals: 2025 } } },
            { program: { code: { in: [34, 51] } } }
        ]
    );
});

test("combines catalog program filters in the Prisma query", async () => {
    let receivedWhere: unknown;
    const service = createCatalogProgramService({
        prisma: {
            catalogProgram: {
                findMany: async ({ where }: { where: unknown }) => {
                    receivedWhere = where;
                    return [];
                }
            }
        } as never
    });

    const query = IO.list.request.parse({
        query: {
            filter: { catalogYear: "2025", programCode: "34" }
        }
    }).query;
    await service.list(query);

    assert.deepEqual(receivedWhere, {
        AND: [
            { catalog: { year: { equals: 2025 } } },
            { program: { code: { equals: 34 } } }
        ]
    });
});

test("rejects catalog program fields and operators outside the profile", () => {
    assert.equal(
        IO.list.request.safeParse({
            query: { filter: { title: "Computação" } }
        }).success,
        false
    );
    assert.equal(
        IO.list.request.safeParse({
            query: { filter: { catalogYear: { gt: "2020" } } }
        }).success,
        false
    );
});

test("rejects removed flat catalog program query parameters", () => {
    for (const query of [
        { catalogId: "1" },
        { programId: "2" },
        { programCode: "34" }
    ]) {
        assert.equal(IO.list.request.safeParse({ query }).success, false);
    }
});

test("returns a domain problem when the catalog program does not exist", async () => {
    const service = createCatalogProgramService({
        prisma: {
            catalogProgram: { findUnique: async () => null }
        } as never
    });

    const result = await service.getById(42);

    assert.equal(result.isErr(), true);
    if (result.isErr()) {
        assert.equal(result.error.type, "urn:pomi:problem:resource-not-found");
    }
});
