import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

export function resolveOpenApiOutput(
    arguments_: string[],
    scriptUrl: string,
    cwd: string
): string {
    const { values } = parseArgs({
        args: arguments_,
        options: {
            output: {
                type: "string"
            }
        },
        strict: true
    });

    if (values.output !== undefined) {
        return resolve(cwd, values.output);
    }

    return fileURLToPath(new URL("../../../../openapi.json", scriptUrl));
}

export async function writeOpenApiDocument(
    output: string,
    document: unknown
): Promise<void> {
    const directory = dirname(output);
    const temporary = resolve(
        directory,
        `.${basename(output)}.${process.pid}.${randomUUID()}.tmp`
    );

    await mkdir(directory, { recursive: true });
    try {
        await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`);
        await rename(temporary, output);
    } finally {
        await rm(temporary, { force: true });
    }
}
