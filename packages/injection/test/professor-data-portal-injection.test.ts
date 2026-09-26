import { TrainingDegree } from "@pomi/db";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
    collectionEquals,
    injectProfessorDataPortal,
    mapWithConcurrency,
    parseDegree,
    parsePosition
} from "../src/services/ProfessorDataPortalInjection.js";

test("compara relações independentemente da ordem e preserva multiplicidade", () => {
    assert.equal(
        collectionEquals(
            ["lattes", "orcid", "orcid"],
            ["orcid", "lattes", "orcid"],
            (value) => value
        ),
        true
    );
    assert.equal(
        collectionEquals(
            ["lattes", "orcid"],
            ["lattes", "lattes"],
            (value) => value
        ),
        false
    );
});

test("limita a persistência ao número configurado de workers", async () => {
    let active = 0;
    let peak = 0;
    await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
    });
    assert.equal(peak, 2);
});

test("normaliza formações e cargos do Portal", () => {
    assert.equal(parseDegree("Pós-Doutor(a)"), TrainingDegree.POST_DOCTORATE);
    const professorAssociado = parsePosition("MS5.2 — Professor Associado II");
    assert.equal(professorAssociado?.canonicalKey, "ms:ms5.2");
    assert.equal(professorAssociado?.careerReference?.code, "MS5.2");
    assert.equal(
        parsePosition("B3 — Professor Associado MTS-B")?.canonicalKey,
        "mts:b3"
    );
    assert.equal(
        parsePosition("E — Docente em Ensino de Línguas II")?.canonicalKey,
        "del:e"
    );
    assert.equal(
        parsePosition("PESQUISADOR COLABORADOR")?.canonicalKey,
        "researcher:collaborator"
    );
});

test("não abre transação para perfil já sincronizado", async () => {
    const directory = await mkdtemp(join(tmpdir(), "professor-data-portal-"));
    const inputPath = join(directory, "docentes.json");
    await writeFile(
        inputPath,
        JSON.stringify({
            data: [
                {
                    portalId: 1,
                    name: "Ada Lovelace",
                    position: "MS5.2 — Professor Associado II",
                    unit: { code: "IC" },
                    identifiers: [],
                    citationNames: [],
                    latestTraining: [],
                    keywords: [],
                    coauthors: []
                }
            ],
            issues: [],
            pages: []
        })
    );
    let transactions = 0;
    const infos: Array<Record<string, unknown>> = [];
    const prisma = {
        professor: {
            findMany: async () => [{ id: 1, name: "Ada Lovelace" }]
        },
        unit: {
            findMany: async () => [
                { id: 1, code: "IC", name: "Instituto de Computação" }
            ]
        },
        professorDataPortalProfile: {
            findMany: async () => [
                {
                    id: 1,
                    professorId: 1,
                    portalId: 1,
                    name: "Ada Lovelace",
                    email: null,
                    lattesAbstract: null,
                    unitId: 1,
                    departmentId: null,
                    positionId: 1,
                    identities: [],
                    citationNames: [],
                    trainings: [],
                    keywords: [],
                    coauthors: []
                }
            ]
        },
        department: { findMany: async () => [] },
        academicPosition: {
            findMany: async () => [
                {
                    id: 1,
                    canonicalKey: "ms:ms5.2"
                }
            ]
        },
        keyword: { findMany: async () => [] },
        coauthor: { findMany: async () => [] },
        $transaction: async () => {
            transactions += 1;
        }
    };
    try {
        await injectProfessorDataPortal({
            prisma: prisma as never,
            inputPath,
            runId: "run-id",
            auditContext: {
                source: "injection",
                runId: "run-id",
                injectionName: "professors-data-portal",
                mode: "inject"
            },
            logger: {
                info: (value: Record<string, unknown>) => infos.push(value),
                debug: () => undefined
            } as never
        });
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
    assert.equal(transactions, 0);
    assert.ok(
        infos.some(
            (value) =>
                value.event === "injection.professors.completed" &&
                value.unchanged === 1
        )
    );
});
