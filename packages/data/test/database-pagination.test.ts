import { createProfessorDataPortalService } from "#/modules/academic/professor-data-portal/ProfessorDataPortal.service.js";
import { createRoomService } from "#/modules/academic/room/Room.service.js";
import { createUnitService } from "#/modules/academic/unit/Unit.service.js";
import { createCatalogProgramService } from "#/modules/catalog/catalog-program/CatalogProgram.service.js";
import { createCatalogService } from "#/modules/catalog/catalog/Catalog.service.js";
import { createLanguageService } from "#/modules/catalog/language/Language.service.js";
import { createProgramService } from "#/modules/catalog/program/Program.service.js";
import { createSpecializationService } from "#/modules/catalog/specialization/Specialization.service.js";
import { createExchangePlaceService } from "#/modules/exchange/exchange-place/ExchangePlace.service.js";
import { createCalendarEventService } from "#/modules/schedule/calendar-event/CalendarEvent.service.js";
import { createCalendarTagService } from "#/modules/schedule/calendar-tag/CalendarTag.service.js";
import { createDailyMenuService } from "#/modules/schedule/daily-menu/DailyMenu.service.js";
import { createStudyPeriodService } from "#/modules/schedule/study-period/StudyPeriod.service.js";
import type { PageResult, PaginationQuery } from "@pomi/api-core";
import type { PrismaClient } from "@pomi/db";
import assert from "node:assert/strict";
import test from "node:test";

const cases: Array<
    [
        string,
        (
            prisma: PrismaClient,
            query: PaginationQuery
        ) => Promise<PageResult<unknown>>
    ]
> = [
    [
        "catalogProgram",
        (prisma, query) => createCatalogProgramService({ prisma }).list(query)
    ],
    [
        "catalog",
        (prisma, query) => createCatalogService({ prisma }).list(query)
    ],
    ["unit", (prisma, query) => createUnitService({ prisma }).list(query)],
    ["room", (prisma, query) => createRoomService({ prisma }).list(query)],
    [
        "program",
        (prisma, query) => createProgramService({ prisma }).list(query)
    ],
    [
        "language",
        (prisma, query) => createLanguageService({ prisma }).list(query)
    ],
    [
        "specialization",
        (prisma, query) => createSpecializationService({ prisma }).list(query)
    ],
    [
        "exchangePlace",
        (prisma, query) => createExchangePlaceService({ prisma }).list(query)
    ],
    [
        "dailyMenu",
        (prisma, query) => createDailyMenuService({ prisma }).list(query)
    ],
    [
        "calendarEvent",
        (prisma, query) => createCalendarEventService({ prisma }).list(query)
    ],
    [
        "calendarTag",
        (prisma, query) => createCalendarTagService({ prisma }).list(query)
    ],
    [
        "studyPeriod",
        (prisma, query) => createStudyPeriodService({ prisma }).list(query)
    ],
    [
        "academicPosition",
        (prisma, query) =>
            createProfessorDataPortalService({ prisma }).listPositions(query)
    ],
    [
        "department",
        (prisma, query) =>
            createProfessorDataPortalService({ prisma }).listDepartments(query)
    ]
];

for (const [model, list] of cases) {
    test(`${model} applies pagination in Prisma and counts the same filtered collection`, async () => {
        let find: Record<string, unknown> = {};
        let counted: unknown;
        const prisma = {
            [model]: {
                count: async ({ where }: { where: unknown }) => {
                    counted = where;
                    return 7;
                },
                findMany: async (args: Record<string, unknown>) => {
                    find = args;
                    return [];
                }
            }
        } as unknown as PrismaClient;
        const result = await list(prisma, { page: 99, pageSize: 2 });
        assert.equal(find.skip, 196);
        assert.equal(find.take, 2);
        assert.deepEqual(find.where, counted);
        assert.equal(result.total, 7);
        assert.deepEqual(result.items, []);
        assert.deepEqual(result.pagination, {
            mode: "page",
            page: 99,
            pageSize: 2,
            skip: 196,
            take: 2
        });
        for (const query of [{}, { pageSize: "all" as const }]) {
            await list(prisma, query);
            assert.equal(Object.hasOwn(find, "skip"), false);
            assert.equal(Object.hasOwn(find, "take"), false);
        }
    });
}

test("catalog program pagination preserves relational filters and explicit stable ordering", async () => {
    let find: Record<string, unknown> = {};
    let counted: unknown;
    const service = createCatalogProgramService({
        prisma: {
            catalogProgram: {
                count: async ({ where }: { where: unknown }) => {
                    counted = where;
                    return 0;
                },
                findMany: async (args: Record<string, unknown>) => {
                    find = args;
                    return [];
                }
            }
        } as never
    });
    await service.list({
        page: 1,
        pageSize: 10,
        filter: [
            { path: ["catalogYear"], operator: "eq", values: [2027] },
            { path: ["programCode"], operator: "eq", values: [42] }
        ],
        sort: [{ field: "programName", direction: "asc" }]
    });
    assert.deepEqual(counted, {
        AND: [
            { catalog: { year: { equals: 2027 } } },
            { program: { code: { equals: 42 } } }
        ]
    });
    assert.deepEqual(find.where, counted);
    assert.deepEqual(find.orderBy, [
        { program: { name: "asc" } },
        { id: "asc" }
    ]);
    assert.equal(find.take, 10);
    assert.ok(find.include);
});

test("database failures propagate instead of falling back to an unbounded list", async () => {
    const failure = new Error("database unavailable");
    const service = createCatalogService({
        prisma: {
            catalog: {
                count: async () => {
                    throw failure;
                },
                findMany: async () =>
                    assert.fail("must not retry as an unbounded collection")
            }
        } as never
    });
    await assert.rejects(
        service.list({ page: 1, pageSize: 10 }),
        (error) => error === failure
    );
});
