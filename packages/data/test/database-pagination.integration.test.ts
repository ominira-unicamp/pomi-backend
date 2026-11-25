import IO from "#/modules/catalog/catalog-program/CatalogProgram.contract.js";
import { createCatalogProgramService } from "#/modules/catalog/catalog-program/CatalogProgram.service.js";
import { createDatabaseClient } from "@pomi/db";
import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import test from "node:test";

const databaseUrl = process.env.POMI_DATA_TEST_DATABASE_URL;

test(
    "PostgreSQL paginates catalog programs before loading complete curriculum relations",
    { skip: !databaseUrl },
    async () => {
        assert.match(new URL(databaseUrl!).pathname, /_test$/);
        const prisma = createDatabaseClient(databaseUrl!);
        const service = createCatalogProgramService({ prisma });
        const year = randomInt(100000, 1000000);
        const code = randomInt(100000, 1000000);
        let catalogId: number | undefined;
        let unitId: number | undefined;
        const programIds: number[] = [];
        try {
            const unit = await prisma.unit.create({
                data: { code: randomUUID(), name: "Pagination test" }
            });
            unitId = unit.id;
            const catalog = await prisma.catalog.create({ data: { year } });
            catalogId = catalog.id;
            for (let i = 0; i < 3; i++) {
                const program = await prisma.program.create({
                    data: { code: code + i, name: "Same name", unitId }
                });
                programIds.push(program.id);
                await prisma.catalogProgram.create({
                    data: {
                        catalogId,
                        programId: program.id,
                        variants: { create: { programId: program.id } },
                        courseBlocks: {
                            create: {
                                type: "elective",
                                credits: 4,
                                courseRequirements: {
                                    create: [
                                        { type: "any" },
                                        { type: "prefix", prefix: "MC" }
                                    ]
                                }
                            }
                        }
                    }
                });
            }
            const query = IO.list.request.parse({
                query: {
                    page: 1,
                    pageSize: 2,
                    filter: { catalogYear: String(year) },
                    sort: "programName:asc"
                }
            }).query;
            const first = await service.list(query);
            const second = await service.list({ ...query, page: 2 });
            assert.equal(first.total, 3);
            assert.equal(second.total, 3);
            assert.equal(first.items.length, 2);
            assert.equal(second.items.length, 1);
            const joined = [...first.items, ...second.items];
            assert.equal(new Set(joined.map((item) => item.id)).size, 3);
            assert.deepEqual(
                joined.map((item) => item.programId),
                programIds
            );
            for (const item of joined) {
                assert.equal(item.variants.length, 1);
                assert.equal(item.base.electives.length, 1);
                assert.equal(item.base.electives[0]!.courses.length, 2);
            }
            assert.deepEqual(
                (await service.list({ ...query, page: 3 })).items,
                []
            );
            assert.equal((await service.list({ ...query, page: 3 })).total, 3);
            const all = await service.list({
                filter: query.filter,
                pageSize: "all"
            });
            assert.equal(all.items.length, 3);
            const filtered = await service.list({
                ...query,
                filter: [
                    ...query.filter!,
                    {
                        path: ["programCode"],
                        operator: "eq",
                        values: [code + 1]
                    }
                ]
            });
            assert.equal(filtered.total, 1);
            assert.equal(filtered.items[0]!.programCode, code + 1);
            const empty = await service.list({
                ...query,
                filter: [
                    {
                        path: ["catalogYear"],
                        operator: "eq",
                        values: [year + 1]
                    }
                ]
            });
            assert.equal(empty.total, 0);
            assert.deepEqual(empty.items, []);
        } finally {
            if (catalogId)
                await prisma.catalogProgram.deleteMany({
                    where: { catalogId }
                });
            await prisma.program.deleteMany({
                where: { id: { in: programIds } }
            });
            if (catalogId)
                await prisma.catalog.delete({ where: { id: catalogId } });
            if (unitId) await prisma.unit.delete({ where: { id: unitId } });
            await prisma.$disconnect();
        }
    }
);
