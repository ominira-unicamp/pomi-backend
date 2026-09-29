import { resolveOpenApiOutput, writeOpenApiDocument } from "./openApiExport.js";

process.env.DISABLED_AUTH ??= "true";
process.env.NODE_ENV ??= "development";

const { generateDataOpenApiDocument } = await import("../src/OpenApi.js");
const output = resolveOpenApiOutput(
    process.argv.slice(2),
    import.meta.url,
    process.cwd()
);

await writeOpenApiDocument(output, generateDataOpenApiDocument());
