import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { DataAuditOperation, createDatabaseClient } from "../src/index.js";

const databaseUrl = process.env.POMI_AUDIT_TEST_DATABASE_URL;

test(
    "records row changes with transaction-local injection context",
    { skip: !databaseUrl },
    async () => {
        const prisma = createDatabaseClient(databaseUrl!);
        const runId = randomUUID();
        const code = `AUDIT-${randomUUID()}`;
        try {
            const unit = await prisma.$transaction(async (transaction) => {
                await transaction.$executeRaw`
                    SELECT set_config(
                        'pomi.audit_context',
                        ${JSON.stringify({
                            source: "injection",
                            runId,
                            injectionName: "audit-test",
                            mode: "all"
                        })},
                        true
                    )
                `;
                const created = await transaction.unit.create({
                    data: { code }
                });
                await transaction.unit.update({
                    where: { id: created.id },
                    data: { code: `${code}-UPDATED` }
                });
                return transaction.unit.delete({ where: { id: created.id } });
            });
            const events = await prisma.dataAuditEvent.findMany({
                where: { runId },
                orderBy: { id: "asc" }
            });

            assert.deepEqual(
                events.map((event) => event.operation),
                [
                    DataAuditOperation.CREATE,
                    DataAuditOperation.UPDATE,
                    DataAuditOperation.DELETE
                ]
            );
            assert.deepEqual(events[0]?.recordKey, { id: unit.id });
            assert.equal(events[0]?.before, null);
            assert.equal(events[2]?.after, null);
            assert.equal(events[0]?.injectionName, "audit-test");
        } finally {
            await prisma.$disconnect();
        }
    }
);

test(
    "does not persist audit events when the data transaction rolls back",
    { skip: !databaseUrl },
    async () => {
        const prisma = createDatabaseClient(databaseUrl!);
        const runId = randomUUID();
        try {
            await assert.rejects(
                prisma.$transaction(async (transaction) => {
                    await transaction.$executeRaw`
                        SELECT set_config(
                            'pomi.audit_context',
                            ${JSON.stringify({
                                source: "injection",
                                runId,
                                injectionName: "audit-test",
                                mode: "all"
                            })},
                            true
                        )
                    `;
                    await transaction.room.create({
                        data: { code: `AUDIT-${randomUUID()}` }
                    });
                    throw new Error("rollback");
                })
            );
            assert.equal(
                await prisma.dataAuditEvent.count({ where: { runId } }),
                0
            );
        } finally {
            await prisma.$disconnect();
        }
    }
);

test(
    "installs the audit trigger on every data table except its event table",
    { skip: !databaseUrl },
    async () => {
        const prisma = createDatabaseClient(databaseUrl!);
        try {
            const missing = await prisma.$queryRaw<
                Array<{ tableName: string }>
            >`
                SELECT relation.relname AS "tableName"
                FROM pg_class AS relation
                INNER JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
                WHERE namespace.nspname = 'data'
                  AND relation.relkind = 'r'
                  AND relation.relname <> 'DataAuditEvent'
                  AND NOT EXISTS (
                      SELECT 1
                      FROM pg_trigger AS trigger
                      WHERE trigger.tgrelid = relation.oid
                        AND trigger.tgname = 'captureDataAuditEvent'
                        AND NOT trigger.tgisinternal
                  )
            `;
            assert.deepEqual(missing, []);
        } finally {
            await prisma.$disconnect();
        }
    }
);
