import assert from "node:assert/strict";
import test from "node:test";
import {
    collectProfessorName,
    haveSameProgramIds,
    reservationProgramRelationWrites,
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

test("compara relações de programas sem depender da ordem", () => {
    assert.equal(haveSameProgramIds([1, 2], [2, 1]), true);
    assert.equal(haveSameProgramIds([1], [1, 2]), false);
    assert.equal(haveSameProgramIds([1, 2], [1, 3]), false);
});

test("separa escritas de criação e atualização das reservas", () => {
    assert.deepEqual(reservationProgramRelationWrites([1, 2]), {
        create: {
            createMany: { data: [{ programId: 1 }, { programId: 2 }] }
        },
        update: {
            deleteMany: {},
            createMany: { data: [{ programId: 1 }, { programId: 2 }] }
        }
    });
    assert.deepEqual(reservationProgramRelationWrites([]), {
        create: undefined,
        update: { deleteMany: {} }
    });
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

test("valida todos os créditos antes de acessar o banco", async () => {
    const { injectAcademicData } =
        await import("../src/services/AcademicDataInjection.js");
    const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const directory = await mkdtemp(join(tmpdir(), "academic-credits-"));
    try {
        const inputPath = join(directory, "input.json");
        await writeFile(
            inputPath,
            JSON.stringify({
                year: 2027,
                semester: 1,
                institutes: [
                    {
                        code: "FE",
                        name: "FE",
                        courses: [
                            {
                                code: "VALID",
                                name: "Nome",
                                credits: 2,
                                classes: []
                            },
                            { code: "INVALID", name: "Nome", classes: [] }
                        ]
                    }
                ]
            })
        );
        const context = {
            inputPath,
            prisma: new Proxy(
                {},
                {
                    get() {
                        throw new Error("Banco acessado antes da validação");
                    }
                }
            ),
            logger: { info() {} }
        } as unknown as Parameters<typeof injectAcademicData>[0];
        await assert.rejects(
            injectAcademicData(context),
            /Créditos ausentes ou inválidos para INVALID/
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("cria disciplina com créditos da fonte e preserva créditos na atualização normal", async () => {
    const { injectAcademicData } =
        await import("../src/services/AcademicDataInjection.js");
    const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const directory = await mkdtemp(join(tmpdir(), "academic-credits-create-"));
    try {
        const inputPath = join(directory, "input.json");
        await writeFile(
            inputPath,
            JSON.stringify({
                year: 2027,
                semester: 1,
                institutes: [
                    {
                        code: "FE",
                        name: "FE",
                        courses: [
                            {
                                code: "EX092",
                                name: "Nome",
                                credits: 2,
                                classes: []
                            }
                        ]
                    }
                ]
            })
        );
        let writes: unknown;
        const prisma = {
            program: {
                async findMany() {
                    return [];
                }
            },
            professor: {
                async findMany() {
                    return [];
                }
            },
            room: { async createMany() {} },
            studyPeriod: {
                async upsert() {
                    return { id: 1 };
                }
            },
            unit: {
                async upsert() {},
                async findMany() {
                    return [{ id: 1, code: "FE" }];
                }
            },
            course: {
                async upsert(args: unknown) {
                    writes = args;
                    throw new Error("capturado");
                }
            },
            async $executeRaw() {},
            async $transaction(operation: (tx: unknown) => Promise<unknown>) {
                return operation(prisma);
            }
        };
        const context = {
            inputPath,
            prisma,
            logger: { info() {} },
            auditContext: { source: "injection" }
        } as unknown as Parameters<typeof injectAcademicData>[0];
        await assert.rejects(injectAcademicData(context), /capturado/);
        assert.deepEqual(writes, {
            where: { code: "EX092" },
            create: { code: "EX092", name: "Nome", credits: 2, unitId: 1 },
            update: { unitId: 1 }
        });
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
