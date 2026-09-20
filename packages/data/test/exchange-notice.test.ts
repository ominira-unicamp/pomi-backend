import IO from "#/modules/exchange/exchange-notice/ExchangeNotice.contract.js";
import { createExchangeNoticeService } from "#/modules/exchange/exchange-notice/ExchangeNotice.service.js";
import { createExchangePlaceService } from "#/modules/exchange/exchange-place/ExchangePlace.service.js";
import assert from "node:assert/strict";
import test from "node:test";

const notice = {
    id: 12,
    naturalKey: "12|DERI|INTERCÂMBIO",
    number: "12",
    issuer: "DERI",
    title: "Intercâmbio",
    placeId: 4,
    registrationOriginalText: "01/09/2026 a 10/09/2026",
    registrationStart: new Date("2026-09-01T00:00:00.000Z"),
    registrationEnd: new Date("2026-09-10T00:00:00.000Z"),
    place: { id: 4, name: "França", normalizedName: "FRANCA" },
    files: [
        {
            id: 8,
            noticeId: 12,
            name: "Edital",
            normalizedName: "EDITAL",
            url: "https://example.test/edital.pdf",
            createdAt: new Date("2026-09-01T00:00:00.000Z")
        }
    ]
} as const;

test("declara endpoints públicos e valida intervalos de inscrição", () => {
    assert.deepEqual(IO.list.meta.path, [
        { type: "literal", value: "exchange-notices" }
    ]);
    assert.equal(
        IO.list.request.safeParse({
            query: {
                filter: {
                    registrationStart: {
                        gte: "2026-09-01",
                        lte: "2026-09-10"
                    }
                }
            }
        }).success,
        true
    );
    assert.equal(
        IO.list.request.safeParse({
            query: {
                filter: {
                    registrationEnd: {
                        gte: "2026-09-10",
                        lte: "2026-09-01"
                    }
                }
            }
        }).success,
        true
    );
    assert.equal(
        IO.list.request.safeParse({
            query: {
                q: "africa",
                filter: {
                    issuer: { ne: "Outra unidade" },
                    registrationEnd: { gt: "2026-09-01" }
                }
            }
        }).success,
        true
    );
});

test("valida ordenação de editais com campos aninhados", () => {
    const parsed = IO.list.request.parse({
        query: { sort: "place.name:asc,registrationEnd:desc" }
    });
    assert.deepEqual(parsed.query.sort, [
        { field: "place.name", direction: "asc" },
        { field: "registrationEnd", direction: "desc" }
    ]);
});

test("lista editais com os dados públicos completos", async () => {
    let query: unknown;
    const service = createExchangeNoticeService({
        prisma: {
            exchangeNotice: {
                findMany: async (value: unknown) => {
                    query = value;
                    return [notice];
                }
            }
        } as never
    });

    const result = await service.list({
        filter: [{ path: ["placeId"], operator: "eq", values: [4] }]
    });

    assert.deepEqual((query as { where: unknown }).where, {
        AND: [{ placeId: { equals: 4 } }]
    });
    assert.deepEqual(result, [
        {
            id: 12,
            number: "12",
            issuer: "DERI",
            title: "Intercâmbio",
            place: {
                id: 4,
                name: "França",
                _paths: {
                    notices: "/exchange-notices?filter[placeId]=4"
                }
            },
            registrationOriginalText: "01/09/2026 a 10/09/2026",
            registrationStart: "2026-09-01",
            registrationEnd: "2026-09-10",
            files: [
                {
                    id: 8,
                    name: "Edital",
                    url: "https://example.test/edital.pdf"
                }
            ],
            _paths: { self: "/exchange-notices/12" }
        }
    ]);
});

test("combina filtros estruturados e busca normalizada", async () => {
    let query: unknown;
    const service = createExchangeNoticeService({
        prisma: {
            exchangeNotice: {
                findMany: async (value: unknown) => {
                    query = value;
                    return [notice];
                }
            }
        } as never
    });

    const result = await service.list({
        q: "intercambio",
        filter: [
            { path: ["issuer"], operator: "ne", values: ["Outra"] },
            {
                path: ["registrationEnd"],
                operator: "gt",
                values: ["2026-09-01"]
            }
        ]
    });

    assert.equal(result.length, 1);
    assert.deepEqual((query as { where: unknown }).where, {
        AND: [
            { issuer: { not: "Outra" } },
            { registrationEnd: { gt: new Date("2026-09-01") } }
        ]
    });
});

test("compila ordenação de editais mantendo nulos por último", async () => {
    let query: unknown;
    const service = createExchangeNoticeService({
        prisma: {
            exchangeNotice: {
                findMany: async (value: unknown) => {
                    query = value;
                    return [notice];
                }
            }
        } as never
    });

    await service.list({
        sort: [
            { field: "registrationEnd", direction: "asc" },
            { field: "place.name", direction: "desc" }
        ]
    });

    assert.deepEqual((query as { orderBy: unknown }).orderBy, [
        { registrationEnd: { sort: "asc", nulls: "last" } },
        { place: { name: "desc" } },
        { id: "desc" }
    ]);
});

test("lista locais em ordem de nome com caminho para seus editais", async () => {
    const service = createExchangePlaceService({
        prisma: {
            exchangePlace: {
                findMany: async () => [
                    { id: 4, name: "França", normalizedName: "FRANCA" }
                ]
            }
        } as never
    });

    assert.deepEqual(await service.list({}), [
        {
            id: 4,
            name: "França",
            _paths: {
                notices: "/exchange-notices?filter[placeId]=4"
            }
        }
    ]);
});
