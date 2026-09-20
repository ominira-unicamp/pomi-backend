import assert from "node:assert/strict";
import test from "node:test";
import {
    backfillClassReservationPrograms,
    ClassReservationBackfillValidationError,
    createClassReservationBackfillPlan
} from "../src/classReservationBackfill.js";
import type { DatabaseClient } from "../src/PrismaClient.js";

test("planeja somente relações ausentes e deduplica códigos", () => {
    const plan = createClassReservationBackfillPlan(
        [
            {
                id: 10,
                reservations: [34, 34, 41],
                reservationPrograms: [{ programId: 1 }]
            },
            { id: 11, reservations: [], reservationPrograms: [] }
        ],
        [
            { id: 1, code: 34 },
            { id: 2, code: 41 }
        ]
    );

    assert.deepEqual(plan.additions, [{ classId: 10, programId: 2 }]);
    assert.deepEqual(plan.report, {
        classCount: 2,
        expectedRelationCount: 2,
        existingRelationCount: 1,
        missingRelationCount: 1,
        unresolved: [],
        applied: false
    });
});

test("reporta todos os códigos de programa desconhecidos", () => {
    const plan = createClassReservationBackfillPlan(
        [
            {
                id: 10,
                reservations: [99, 100, 99],
                reservationPrograms: []
            }
        ],
        []
    );

    assert.deepEqual(plan.additions, []);
    assert.deepEqual(plan.report.unresolved, [
        { classId: 10, programCode: 99 },
        { classId: 10, programCode: 100 }
    ]);
});

test("não inicia transação quando existe código desconhecido", async () => {
    let transactionStarted = false;
    const database = {
        class: {
            findMany: async () => [
                {
                    id: 10,
                    reservations: [99],
                    reservationPrograms: []
                }
            ]
        },
        program: { findMany: async () => [] },
        $transaction: async () => {
            transactionStarted = true;
        }
    } as unknown as DatabaseClient;

    await assert.rejects(
        backfillClassReservationPrograms(database, { apply: true }),
        ClassReservationBackfillValidationError
    );
    assert.equal(transactionStarted, false);
});
