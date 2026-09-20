import assert from "node:assert/strict";
import test from "node:test";
import { parseCurriculum } from "../src/services/CatalogInjection.js";

test("parses base, elective, specialization and language blocks", () => {
    const curriculum = parseCurriculum(`
        <h2>42 - Curso - Currículo Pleno</h2>
        <h3>Núcleo Comum ao Curso</h3>
        <table><tr><td><a>AA100</a></td></tr></table>
        <h3>Disciplinas Eletivas</h3>
        <p>O aluno deve obter 12 créditos dentre as disciplinas abaixo.</p>
        <table><tr><td><a>EX---</a></td></tr><tr><td><a>QA85---</a></td></tr><tr><td><a>-----</a></td></tr></table>
        <h3>Opções por Língua</h3>
        <p><strong>Inglês</strong></p>
        <table><tr><td><a>LA100</a></td></tr></table>
        <h2>AA - Habilitação</h2>
        <h3>Disciplinas Obrigatórias</h3>
        <table><tr><td><a>BB200</a></td></tr></table>
    `);

    assert.equal(curriculum.blocks.length, 2);
    assert.deepEqual(curriculum.blocks[0], {
        type: "mandatory",
        credits: null,
        requirements: [{ type: "specific", code: "AA100" }]
    });
    assert.deepEqual(curriculum.blocks[1], {
        type: "elective",
        credits: 12,
        requirements: [
            { type: "prefix", code: "EX" },
            { type: "prefix", code: "QA85" },
            { type: "any" }
        ]
    });
    assert.deepEqual(curriculum.languages, [
        {
            name: "Inglês",
            blocks: [
                {
                    type: "mandatory",
                    credits: null,
                    requirements: [{ type: "specific", code: "LA100" }]
                }
            ]
        }
    ]);
    assert.deepEqual(curriculum.specializations, [
        {
            code: "AA",
            name: "Habilitação",
            blocks: [
                {
                    type: "mandatory",
                    credits: null,
                    requirements: [{ type: "specific", code: "BB200" }]
                }
            ]
        }
    ]);
});
