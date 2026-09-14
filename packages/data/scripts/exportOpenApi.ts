import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

process.env.DISABLED_AUTH ??= "true";
process.env.NODE_ENV ??= "development";

const { generateDataOpenApiDocument } = await import("../src/OpenApi.js");
const publicOutput = fileURLToPath(
    new URL("../../../../openapi.json", import.meta.url)
);
const allOutput = fileURLToPath(
    new URL("../data-all-openapi.json", import.meta.url)
);

await Promise.all([
    writeFile(
        publicOutput,
        `${JSON.stringify(generateDataOpenApiDocument("public"), null, 2)}\n`
    ),
    writeFile(
        allOutput,
        `${JSON.stringify(generateDataOpenApiDocument("all"), null, 2)}\n`
    )
]);
