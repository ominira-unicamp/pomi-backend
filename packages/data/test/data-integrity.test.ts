import {
    auditDataIntegrity,
    dataIntegrityRules
} from "#/data-integrity/DataIntegrity.js";
import type { DatabaseClient } from "@pomi/db";
import assert from "node:assert/strict";
import test from "node:test";

test("audits every rule in one read-only repeatable-read transaction", async () => {
    const queries: string[] = [];
    let readOnly = false;
    let isolationLevel: unknown;
    const database = {
        $transaction: async (
            callback: (tx: unknown) => Promise<unknown>,
            options: { isolationLevel: unknown }
        ) => {
            isolationLevel = options.isolationLevel;
            return callback({
                $executeRawUnsafe: async (sql: string) => {
                    assert.equal(sql, "SET TRANSACTION READ ONLY");
                    readOnly = true;
                },
                $queryRawUnsafe: async (sql: string, limit: number) => {
                    assert.equal(readOnly, true);
                    assert.equal(limit, 2);
                    queries.push(sql);
                    return [
                        {
                            count: queries.length === 1 ? 3n : 0n,
                            sampleKeys: queries.length === 1 ? ["4", "9"] : null
                        }
                    ];
                }
            });
        }
    } as unknown as DatabaseClient;

    const report = await auditDataIntegrity(database, 2);

    assert.equal(isolationLevel, "RepeatableRead");
    assert.equal(queries.length, dataIntegrityRules.length);
    assert.equal(report.violations, 3);
    assert.deepEqual(report.results[0]?.sampleKeys, ["4", "9"]);
    assert.equal(report.results[1]?.count, 0);
});

test("rejects invalid sample limits before connecting to the database", async () => {
    for (const limit of [-1, 1.5, 101, Number.NaN]) {
        await assert.rejects(
            auditDataIntegrity({} as DatabaseClient, limit),
            /sampleLimit/
        );
    }
});

test("propagates query errors instead of reporting a clean audit", async () => {
    const database = {
        $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
            callback({
                $executeRawUnsafe: async () => {},
                $queryRawUnsafe: async () => {
                    throw new Error("database unavailable");
                }
            })
    } as unknown as DatabaseClient;

    await assert.rejects(auditDataIntegrity(database), /database unavailable/);
});
