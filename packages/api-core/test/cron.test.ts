import assert from "node:assert/strict";
import test from "node:test";
import { nextCronOccurrence, validateCronExpression } from "../src/cron.js";

test("valida expressões cron de cinco campos", () => {
    assert.equal(validateCronExpression("0 */6 * * *"), "0 */6 * * *");
    assert.throws(() => validateCronExpression("0 0 * * * *"), /cinco campos/);
});

test("calcula a próxima ocorrência sem depender da inicialização", () => {
    const from = new Date("2026-09-04T10:01:30.000Z");
    const next = nextCronOccurrence("*/5 * * * *", from);
    assert.ok(next);
    assert.ok(next.getTime() > from.getTime());
    assert.equal(next.getMinutes() % 5, 5 % 5);
});
