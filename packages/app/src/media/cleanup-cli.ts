import { createDatabaseClient } from "@pomi/db";
import "dotenv/config";

import { createMediaCleanup } from "./MediaCleanup.js";
import { PictRsClient } from "./PictRsClient.js";

const databaseUrl = process.env.DATABASE_URL;
const pictRsUrl = process.env.PICTRS_URL;
const pictRsApiKey = process.env.PICTRS_API_KEY;
if (!databaseUrl || !pictRsUrl || !pictRsApiKey) {
    throw new Error(
        "DATABASE_URL, PICTRS_URL e PICTRS_API_KEY são obrigatórios."
    );
}
const database = createDatabaseClient(databaseUrl);
const cleanup = createMediaCleanup({
    prisma: database,
    pictRsClient: new PictRsClient(pictRsUrl, pictRsApiKey)
});

try {
    const retirement = await cleanup.retireUnlinked();
    const deletion = await cleanup.deleteDue();
    const reconciliation = process.argv.includes("--reconcile")
        ? await cleanup.reconcileOrphans()
        : undefined;
    process.stdout.write(
        `${JSON.stringify({ retirement, deletion, reconciliation })}\n`
    );
    if (deletion.failed || reconciliation?.failed) process.exitCode = 1;
} finally {
    await database.$disconnect();
}
