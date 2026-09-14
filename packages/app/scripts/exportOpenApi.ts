import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

process.env.DISABLED_AUTH ??= "true";
process.env.NODE_ENV ??= "development";

const { generateAppOpenApiDocument } = await import("../src/OpenApi.js");
const studentOutput = fileURLToPath(
    new URL("../app-openapi.json", import.meta.url)
);
const allOutput = fileURLToPath(
    new URL("../app-all-openapi.json", import.meta.url)
);

await Promise.all([
    writeFile(
        studentOutput,
        `${JSON.stringify(generateAppOpenApiDocument("student"), null, 2)}\n`
    ),
    writeFile(
        allOutput,
        `${JSON.stringify(generateAppOpenApiDocument("all"), null, 2)}\n`
    )
]);
