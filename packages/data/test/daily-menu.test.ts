import IO from "#/modules/schedule/daily-menu/DailyMenu.contract.js";
import { createDailyMenuService } from "#/modules/schedule/daily-menu/DailyMenu.service.js";
import assert from "node:assert/strict";
import test from "node:test";

const persistedMenu = {
    id: 1,
    date: new Date("2026-08-20T00:00:00.000Z"),
    createdAt: new Date("2026-08-19T10:00:00.000Z"),
    updatedAt: new Date("2026-08-19T11:00:00.000Z"),
    meals: [
        {
            id: 2,
            dailyMenuId: 1,
            period: "LUNCH",
            diet: "TRADITIONAL",
            status: "AVAILABLE",
            mainDish: "Frango assado",
            items: [{ text: "Arroz e feijão" }],
            observations: [{ text: "Contém glúten" }],
            serviceNotes: [{ text: "Servido no RU" }]
        }
    ]
} as const;

test("declara endpoints públicos e valida o intervalo", () => {
    assert.deepEqual(IO.list.meta.path, [
        { type: "literal", value: "daily-menus" }
    ]);
    assert.equal(
        IO.list.request.safeParse({
            query: {
                filter: {
                    date: { gte: "2026-08-20", lte: "2026-08-21" }
                }
            }
        }).success,
        true
    );
    assert.equal(
        IO.list.request.safeParse({
            query: { filter: { date: { gte: "2026-08-21" } } }
        }).success,
        true
    );
});

test("lista cardápios com refeições e coleções textuais", async () => {
    let query: unknown;
    const service = createDailyMenuService({
        prisma: {
            dailyMenu: {
                findMany: async (value: unknown) => {
                    query = value;
                    return [persistedMenu];
                }
            }
        } as never
    });

    const result = await service.list({
        filter: [
            { path: ["date"], operator: "gte", values: ["2026-08-20"] },
            { path: ["date"], operator: "lte", values: ["2026-08-20"] }
        ]
    });

    assert.deepEqual((query as { where: unknown }).where, {
        AND: [
            { date: { gte: new Date("2026-08-20T00:00:00.000Z") } },
            { date: { lte: new Date("2026-08-20T00:00:00.000Z") } }
        ]
    });
    assert.deepEqual(result, [
        {
            id: 1,
            date: "2026-08-20",
            createdAt: "2026-08-19T10:00:00.000Z",
            updatedAt: "2026-08-19T11:00:00.000Z",
            meals: [
                {
                    id: 2,
                    period: "LUNCH",
                    diet: "TRADITIONAL",
                    status: "AVAILABLE",
                    mainDish: "Frango assado",
                    items: ["Arroz e feijão"],
                    observations: ["Contém glúten"],
                    serviceNotes: ["Servido no RU"]
                }
            ]
        }
    ]);
});

test("retorna problema quando o cardápio não existe", async () => {
    const service = createDailyMenuService({
        prisma: {
            dailyMenu: { findUnique: async () => null }
        } as never
    });

    const result = await service.getById(99);

    assert.equal(result.isErr(), true);
    if (result.isErr())
        assert.equal(result.error.type, "urn:pomi:problem:resource-not-found");
});
