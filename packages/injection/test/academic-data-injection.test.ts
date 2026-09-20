import assert from "node:assert/strict";
import test from "node:test";
import {
    collectProfessorName,
    resolveReservationProgramIds,
    selectNewProfessorNames
} from "../src/services/AcademicDataInjection.js";

test("não seleciona como novos professores que diferem só por acento, espaço ou caixa", () => {
    const professors = new Map<string, { name: string }>();
    collectProfessorName(professors, " José  da  Silva ");
    collectProfessorName(professors, "JOSE DA SILVA");

    assert.equal(professors.size, 1);
    assert.deepEqual(
        selectNewProfessorNames(professors, new Set(["jose da silva"])),
        []
    );
    assert.deepEqual(selectNewProfessorNames(professors, new Set()), [
        { name: "José da Silva" }
    ]);
});

test("resolve códigos de reserva para ids de programas sem duplicatas", () => {
    assert.deepEqual(
        resolveReservationProgramIds(
            [34, 34, 41, 99],
            new Map([
                [34, 1],
                [41, 2]
            ])
        ),
        { programIds: [1, 2], unknownCodes: [99] }
    );
});
