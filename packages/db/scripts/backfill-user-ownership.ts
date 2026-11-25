import { parseArgs } from "node:util";
import { createDatabaseClient } from "../src/PrismaClient.js";
import { backfillUserOwnership } from "../src/userOwnershipBackfill.js";

const { values } = parseArgs({
    options: {
        "target": { type: "string" },
        "expect-host": { type: "string" },
        "expect-database": { type: "string" },
        "expect-source-digest": { type: "string" },
        "apply": { type: "boolean", default: false }
    }
});
const connectionString = process.env.POMI_USER_MIGRATION_DATABASE_URL;
if (!connectionString)
    throw new Error("POMI_USER_MIGRATION_DATABASE_URL is required.");
const url = new URL(connectionString);
const database = decodeURIComponent(url.pathname.slice(1));
if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.search ||
    url.hash
)
    throw new Error(
        "Expected a PostgreSQL URL without query parameters or fragments."
    );
if (
    !values["expect-host"] ||
    !values["expect-database"] ||
    url.hostname !== values["expect-host"] ||
    database !== values["expect-database"]
)
    throw new Error(
        "Database target differs from explicit host/database expectations."
    );
if (values.target === "local") {
    if (
        !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
        !database.endsWith("_test") ||
        url.port === "5433"
    )
        throw new Error(
            "Local migrations require a disposable loopback *_test database outside port 5433."
        );
} else if (values.target === "homolog") {
    if (database !== "pomi")
        throw new Error("Unexpected homologation database.");
} else throw new Error("An explicit local or homolog target is required.");
if (values.apply && !values["expect-source-digest"])
    throw new Error("Apply requires the reviewed dry-run source digest.");
const prisma = createDatabaseClient(connectionString);
try {
    console.log(
        JSON.stringify(
            await backfillUserOwnership(prisma, {
                apply: values.apply,
                expectedSourceDigest: values["expect-source-digest"]
            })
        )
    );
} finally {
    await prisma.$disconnect();
}
