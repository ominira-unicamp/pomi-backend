import { err, type Result } from "@pomi/api-core";
import type { MyPrisma, PrismaClient } from "@pomi/db";

export async function runAtomic<Value, Failure>(
    prisma: PrismaClient,
    work: (tx: MyPrisma.TransactionClient) => Promise<Result<Value, Failure>>,
    options: { isolationLevel?: MyPrisma.TransactionIsolationLevel } = {}
): Promise<Result<Value, Failure>> {
    class Rollback extends Error {
        constructor(readonly failure: Failure) {
            super("Application operation rejected");
        }
    }
    try {
        return await prisma.$transaction(async (tx) => {
            const result = await work(tx);
            if (result.isErr()) throw new Rollback(result.error);
            return result;
        }, options);
    } catch (error) {
        if (error instanceof Rollback) return err(error.failure);
        throw error;
    }
}

export function isTransactionConflict(error: unknown): boolean {
    if (typeof error !== "object" || error === null) return false;
    if ("code" in error && error.code === "P2034") return true;
    if (
        !("cause" in error) ||
        typeof error.cause !== "object" ||
        error.cause === null
    )
        return false;
    const cause = error.cause;
    return (
        "kind" in cause &&
        cause.kind === "TransactionWriteConflict" &&
        "originalCode" in cause &&
        (cause.originalCode === "40001" || cause.originalCode === "40P01")
    );
}
