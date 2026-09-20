import type { DatabaseClient } from "./PrismaClient.js";

type LegacyClass = Readonly<{
    id: number;
    reservations: readonly number[];
    reservationPrograms: ReadonlyArray<Readonly<{ programId: number }>>;
}>;

type ProgramReference = Readonly<{ id: number; code: number }>;

export type ClassReservationBackfillReport = Readonly<{
    classCount: number;
    expectedRelationCount: number;
    existingRelationCount: number;
    missingRelationCount: number;
    unresolved: ReadonlyArray<
        Readonly<{ classId: number; programCode: number }>
    >;
    applied: boolean;
}>;

export class ClassReservationBackfillValidationError extends Error {
    constructor(readonly report: ClassReservationBackfillReport) {
        super("Há reservas com códigos de programa desconhecidos");
    }
}

export function createClassReservationBackfillPlan(
    classes: readonly LegacyClass[],
    programs: readonly ProgramReference[]
) {
    const programIdByCode = new Map(
        programs.map((program) => [program.code, program.id])
    );
    const additions: Array<{ classId: number; programId: number }> = [];
    const unresolved: Array<{ classId: number; programCode: number }> = [];
    let expectedRelationCount = 0;
    let existingRelationCount = 0;

    for (const classEntity of classes) {
        const existingProgramIds = new Set(
            classEntity.reservationPrograms.map(({ programId }) => programId)
        );
        existingRelationCount += existingProgramIds.size;
        for (const programCode of new Set(classEntity.reservations)) {
            expectedRelationCount += 1;
            const programId = programIdByCode.get(programCode);
            if (programId === undefined) {
                unresolved.push({ classId: classEntity.id, programCode });
                continue;
            }
            if (!existingProgramIds.has(programId))
                additions.push({ classId: classEntity.id, programId });
        }
    }

    return {
        additions,
        report: {
            classCount: classes.length,
            expectedRelationCount,
            existingRelationCount,
            missingRelationCount: additions.length,
            unresolved,
            applied: false
        } satisfies ClassReservationBackfillReport
    };
}

export async function backfillClassReservationPrograms(
    database: DatabaseClient,
    options: Readonly<{ apply: boolean }>
): Promise<ClassReservationBackfillReport> {
    const [classes, programs] = await Promise.all([
        database.class.findMany({
            select: {
                id: true,
                reservations: true,
                reservationPrograms: { select: { programId: true } }
            },
            orderBy: { id: "asc" }
        }),
        database.program.findMany({
            select: { id: true, code: true },
            orderBy: { code: "asc" }
        })
    ]);
    const plan = createClassReservationBackfillPlan(classes, programs);
    if (plan.report.unresolved.length > 0)
        throw new ClassReservationBackfillValidationError(plan.report);

    if (options.apply && plan.additions.length > 0)
        await database.$transaction(async (transaction) => {
            for (let start = 0; start < plan.additions.length; start += 1_000)
                await transaction.classReservation.createMany({
                    data: plan.additions.slice(start, start + 1_000),
                    skipDuplicates: true
                });
        });

    return { ...plan.report, applied: options.apply };
}
