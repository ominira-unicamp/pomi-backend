import { config } from "dotenv";
import { resolve } from "node:path";
import {
    backfillClassReservationPrograms,
    ClassReservationBackfillValidationError,
    createDatabaseClient
} from "../src/index.js";

async function main() {
    config({ path: resolve(import.meta.dirname, "../../../.env") });
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL é obrigatório");
    const database = createDatabaseClient(databaseUrl, { max: 1 });
    try {
        const report = await backfillClassReservationPrograms(database, {
            apply: process.argv.includes("--apply")
        });
        process.stdout.write(`${JSON.stringify(report)}\n`);
    } finally {
        await database.$disconnect();
    }
}

main().catch((error) => {
    if (error instanceof ClassReservationBackfillValidationError)
        process.stderr.write(`${JSON.stringify(error.report)}\n`);
    else
        process.stderr.write(
            `${error instanceof Error ? error.message : String(error)}\n`
        );
    process.exitCode = 1;
});
