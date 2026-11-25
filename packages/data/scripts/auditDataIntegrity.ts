import { createDatabaseClient } from "@pomi/db";
import { config } from "dotenv";
import { resolve } from "node:path";
import { auditDataIntegrity } from "../src/data-integrity/DataIntegrity.js";

function parseArguments(args: string[]) {
    let json = false;
    let sampleLimit = 20;
    for (const arg of args) {
        if (arg === "--json") json = true;
        else if (arg.startsWith("--sample-limit="))
            sampleLimit = Number(arg.slice("--sample-limit=".length));
        else throw new Error(`Argumento desconhecido: ${arg}`);
    }
    return { json, sampleLimit };
}

async function main() {
    const { json, sampleLimit } = parseArguments(process.argv.slice(2));
    config({
        path: resolve(import.meta.dirname, "../../../.env"),
        quiet: true
    });
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL é obrigatório");
    const database = createDatabaseClient(databaseUrl, { max: 1 });
    try {
        const report = await auditDataIntegrity(database, sampleLimit);
        if (json) process.stdout.write(`${JSON.stringify(report)}\n`);
        else {
            process.stdout.write(
                `Auditoria da POMI Data: ${report.results.length} regras, ${report.violations} violações\n`
            );
            for (const result of report.results) {
                process.stdout.write(
                    `${result.count === 0 ? "OK" : "FALHA"} ${result.domain}/${result.rule}: ${result.description} (${result.count})${result.sampleKeys.length ? ` Chaves: ${result.sampleKeys.join(", ")}` : ""}\n`
                );
            }
        }
        if (report.violations > 0) process.exitCode = 1;
    } finally {
        await database.$disconnect();
    }
}

main().catch((error) => {
    process.stderr.write(
        `${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 2;
});
