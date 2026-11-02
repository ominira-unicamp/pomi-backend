import { readFile } from "node:fs/promises";
import {
    backfillIdentities,
    localIdentityDatabaseUrl,
    type IdentityMapping
} from "../src/identityBackfill.js";
import { createDatabaseClient } from "../src/PrismaClient.js";

async function main() {
    const args = process.argv.slice(2);
    const mapIndex = args.indexOf("--map");
    if (
        args.some(
            (arg, index) =>
                arg !== "--apply" &&
                arg !== "--map" &&
                !(mapIndex >= 0 && index === mapIndex + 1)
        ) ||
        (mapIndex >= 0 &&
            (!args[mapIndex + 1] || args[mapIndex + 1].startsWith("--")))
    )
        throw new Error(
            "Usage: auth:backfill-local [--map <manifest.json>] [--apply]"
        );
    const connectionString = localIdentityDatabaseUrl(
        process.env.POMI_IAM_LOCAL_DATABASE_URL
    );
    const mappings: IdentityMapping[] =
        mapIndex >= 0
            ? JSON.parse(await readFile(args[mapIndex + 1], "utf8"))
            : [];
    if (!Array.isArray(mappings))
        throw new Error("The mapping manifest must be an array.");
    const prisma = createDatabaseClient(connectionString);
    try {
        console.log(
            JSON.stringify(
                await backfillIdentities(
                    prisma,
                    mappings,
                    args.includes("--apply")
                )
            )
        );
    } finally {
        await prisma.$disconnect();
    }
}

void main().catch((error: unknown) => {
    const safe =
        error instanceof Error &&
        (error.name === "IdentityConsistencyError" ||
            error.message.startsWith("POMI_IAM") ||
            error.message.startsWith("Identity backfill") ||
            error.message.startsWith("Usage:") ||
            error.message.startsWith("The mapping"));
    console.error(
        safe
            ? (error as Error).message
            : "Local identity backfill failed; inspect configuration and source consistency."
    );
    process.exitCode = 1;
});
