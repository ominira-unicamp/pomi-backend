import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

process.env.DISABLED_AUTH ??= "true";
process.env.NODE_ENV ??= "development";

const { generateDataOpenApiDocument } = await import("../src/OpenApi.js");
const output = fileURLToPath(
    new URL("../../../../openapi.json", import.meta.url)
);

await writeFile(
    output,
    `${JSON.stringify(generateDataOpenApiDocument(), null, 2)}\n`
);
