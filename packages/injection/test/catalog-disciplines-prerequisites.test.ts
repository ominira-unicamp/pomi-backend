import assert from "node:assert/strict";
import test from "node:test";
import { parseSpecialRequirement } from "../src/services/CatalogDisciplinesInjection.js";

test("normaliza requisitos especiais do catálogo", () => {
    assert.deepEqual(parseSpecialRequirement("AA200"), {
        specialRequirementType: "AUTHORIZATION",
        specialRequirementValue: 0
    });
    assert.deepEqual(parseSpecialRequirement("AA430"), {
        specialRequirementType: "PROGRESSION_COEFFICIENT",
        specialRequirementValue: 30
    });
});

test("rejeita códigos que não representam requisitos especiais", () => {
    assert.equal(parseSpecialRequirement("MC102"), null);
    assert.equal(parseSpecialRequirement("AA300"), null);
    assert.equal(parseSpecialRequirement("AA4AA"), null);
});
