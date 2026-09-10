import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

process.env.DISABLED_AUTH ??= "true";
process.env.NODE_ENV ??= "development";

const { generateAppOpenApiDocument } = await import("../src/OpenApi.js");
const output = fileURLToPath(new URL("../app-openapi.json", import.meta.url));
const document = generateAppOpenApiDocument("student");

await writeFile(output, `${JSON.stringify(document, null, 2)}\n`);
