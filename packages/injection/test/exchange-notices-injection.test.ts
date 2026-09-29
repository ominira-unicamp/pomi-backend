import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
    exchangeNoticeNaturalKey,
    injectExchangeNotices
} from "../src/services/ExchangeNoticesInjection.js";

const notice = {
    number: " 12/2026 ",
    issuer: "DERI",
    title: "Intercâmbio França",
    place: " França ",
    registration: {
        originalText: "01/09/2026 a 10/09/2026",
        startsAt: "2026-09-01",
        endsAt: "2026-09-10"
    },
    files: [{ name: " Edital ", url: "https://example.test/edital.pdf" }]
};

test("cria chave natural estável para o edital", () => {
    assert.equal(
        exchangeNoticeNaturalKey(notice),
        "12/2026|DERI|INTERCAMBIO FRANCA"
    );
    assert.equal(
        exchangeNoticeNaturalKey({
            ...notice,
            number: null,
            issuer: null,
            title: null
        }),
        null
    );
});

test("persiste edital, local e arquivo normalizados", async () => {
    const directory = await mkdtemp(join(tmpdir(), "exchange-notices-"));
    const inputPath = join(directory, "exchange-notices.json");
    await writeFile(
        inputPath,
        JSON.stringify({ data: [notice], issues: [], pages: [] })
    );
    const changes: unknown[] = [];
    const created = { places: 0, notices: 0, files: 0 };
    const prisma = {
        exchangeNotice: { findMany: async () => [] },
        exchangePlace: { findMany: async () => [] },
        $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
            callback({
                $executeRaw: async () => undefined,
                exchangePlace: {
                    create: async ({ data }: { data: unknown }) => {
                        created.places += 1;
                        return { id: 4, ...(data as object) };
                    }
                },
                exchangeNotice: {
                    create: async ({ data }: { data: unknown }) => {
                        created.notices += 1;
                        return { id: 8, ...(data as object), files: [] };
                    },
                    update: async () => undefined
                },
                exchangeNoticeFile: {
                    create: async ({ data }: { data: unknown }) => {
                        created.files += 1;
                        return { id: 16, ...(data as object) };
                    },
                    update: async () => undefined,
                    deleteMany: async () => undefined
                }
            })
    };

    try {
        await injectExchangeNotices({
            prisma: prisma as never,
            inputPath,
            runId: "run-id",
            auditContext: {
                source: "injection",
                runId: "run-id",
                injectionName: "exchange-notices",
                mode: "all"
            },
            logger: {
                change: (change: unknown) => changes.push(change),
                warn: () => undefined,
                info: () => undefined
            } as never
        });
    } finally {
        await rm(directory, { recursive: true, force: true });
    }

    assert.deepEqual(created, { places: 1, notices: 1, files: 1 });
    assert.equal(changes.length, 3);
});
