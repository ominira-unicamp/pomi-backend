import assert from "node:assert/strict";
import test from "node:test";
import {
    academicCareerReferences,
    academicPositions,
    findAcademicPositionDefinition
} from "../src/academicPositionCatalog.js";

test("catálogo possui chaves canônicas únicas", () => {
    assert.equal(
        new Set(academicPositions.map(({ canonicalKey }) => canonicalKey)).size,
        academicPositions.length
    );
    assert.equal(
        new Set(
            academicCareerReferences.map(
                ({ career, code }) => `${career}:${code}`
            )
        ).size,
        academicCareerReferences.length
    );
});

test("reconhece os vínculos não pertencentes à carreira docente", () => {
    assert.equal(
        findAcademicPositionDefinition("02 — POS-DOUTORANDO-OM")?.canonicalKey,
        "postdoctoral:om:02"
    );
    assert.equal(
        findAcademicPositionDefinition("PROFESSOR COLABORADOR")?.canonicalKey,
        "professor:collaborator"
    );
});
