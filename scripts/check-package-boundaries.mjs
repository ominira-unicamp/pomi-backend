import { readFile, readdir } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../packages", import.meta.url));
const restrictions = {
    "api-core": ["@pomi/db", "@pomi/data", "@pomi/app", "@pomi/injection"],
    "data": ["@pomi/app", "@pomi/injection"],
    "app": ["@pomi/data", "@pomi/injection"],
    "injection": ["@pomi/data", "@pomi/app"]
};

async function sourceFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(
        entries.map((entry) => {
            const path = join(directory, entry.name);
            if (entry.isDirectory() && entry.name !== "dist") {
                return sourceFiles(path);
            }
            return entry.isFile() && extname(path) === ".ts" ? [path] : [];
        })
    );
    return nested.flat();
}

export function checkAppModuleBoundaries(path, source) {
    const violations = [];
    const file = ts.createSourceFile(
        path,
        source,
        ts.ScriptTarget.Latest,
        true
    );
    const imports = [];
    function visit(node) {
        if (
            ts.isImportDeclaration(node) &&
            ts.isStringLiteral(node.moduleSpecifier)
        ) {
            const clause = node.importClause;
            const bindings = clause?.namedBindings;
            const typeOnly =
                !!clause?.isTypeOnly ||
                (!clause?.name &&
                    bindings &&
                    ts.isNamedImports(bindings) &&
                    bindings.elements.length > 0 &&
                    bindings.elements.every((entry) => entry.isTypeOnly));
            imports.push({ specifier: node.moduleSpecifier.text, typeOnly });
        }
        if (
            ts.isCallExpression(node) &&
            node.expression.kind === ts.SyntaxKind.ImportKeyword &&
            ts.isStringLiteral(node.arguments[0])
        )
            imports.push({
                specifier: node.arguments[0].text,
                typeOnly: false
            });
        if (
            ts.isImportTypeNode(node) &&
            ts.isLiteralTypeNode(node.argument) &&
            ts.isStringLiteral(node.argument.literal)
        )
            imports.push({
                specifier: node.argument.literal.text,
                typeOnly: true
            });
        ts.forEachChild(node, visit);
    }
    visit(file);
    const useCase = path.endsWith(".use-case.ts");
    const rule = path.endsWith(".rules.ts");
    const presenter = path.endsWith(".presenter.ts");
    const access = path.endsWith(".access.ts");
    const resource = path.endsWith(".resource.ts");
    const schema = path.endsWith(".schemas.ts");
    for (const { specifier, typeOnly } of imports) {
        const transport =
            /\.(contract|controller|endpoints|http|problems)\.js$/.test(
                specifier
            ) ||
            ["#/BuildHandler.js", "#/Contract.js", "#/Container.js"].includes(
                specifier
            ) ||
            specifier === "express" ||
            specifier.startsWith("express/");
        const io =
            specifier === "@pomi/db" ||
            specifier.startsWith("@prisma/") ||
            /^(?:node:)?(?:fs|http|https|net|child_process)(?:\/|$)/.test(
                specifier
            );
        if (useCase && transport)
            violations.push(`${path} couples a use case to ${specifier}`);
        if (
            rule &&
            (transport ||
                io ||
                specifier === "zod" ||
                /\.(service|access|queries|use-case)\.js$/.test(specifier))
        )
            violations.push(`${path} couples a pure rule to ${specifier}`);
        if (
            presenter &&
            !typeOnly &&
            (transport ||
                io ||
                /\.(service|access|queries|use-case)\.js$/.test(specifier) ||
                specifier === "#/application/Clock.js")
        )
            violations.push(
                `${path} couples a presenter to execution through ${specifier}`
            );
        if (
            access &&
            (transport ||
                /\.(service|use-case)\.js$/.test(specifier) ||
                specifier === "#/application/transactions.js")
        )
            violations.push(
                `${path} couples access to execution through ${specifier}`
            );
        if (schema && transport)
            violations.push(`${path} couples a shared schema to ${specifier}`);
        if (
            resource &&
            !typeOnly &&
            /\.(controller|endpoints|http)\.js$/.test(specifier)
        )
            violations.push(
                `${path} couples an image resource to HTTP through ${specifier}`
            );
    }
    if ((rule || presenter) && /Date\.now\s*\(|new Date\s*\(\s*\)/.test(source))
        violations.push(
            `${path} reads the global clock instead of an explicit instant`
        );
    if (
        (presenter || access) &&
        /\.\$transaction\s*\(|\brunAtomic\s*\(/.test(source)
    )
        violations.push(`${path} opens an implicit transaction`);
    if (
        presenter &&
        /\b(?:prisma|db|tx)\s*\.\s*\w+\s*\.\s*(?:find\w*|create\w*|update\w*|delete\w*|count|aggregate)\s*\(/.test(
            source
        )
    )
        violations.push(`${path} accesses persistence directly`);
    if (useCase && /\b(?:ApiResponse|ResponseSchemaBuilder)\b/.test(source))
        violations.push(`${path} mixes a use case with HTTP responses`);
    if (
        path.endsWith(".service.ts") &&
        /from ["'](?:express|#\/(?:BuildHandler|Contract)\.js)["']|\b(?:ApiResponse|ResponseSchemaBuilder)\b/.test(
            source
        )
    )
        violations.push(`${path} mixes the service layer with HTTP`);
    if (path.endsWith(".controller.ts") || path.endsWith(".endpoints.ts")) {
        for (const forbidden of ["ctx.prisma", "ctx.zodIds", "request.prisma"])
            if (source.includes(forbidden))
                violations.push(
                    `${path} accesses persistence through ${forbidden}`
                );
    }
    return violations;
}

async function checkPackageBoundaries() {
    const violations = [];
    for (const [packageName, forbidden] of Object.entries(restrictions)) {
        for (const file of await sourceFiles(join(root, packageName))) {
            const source = await readFile(file, "utf8");
            for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) {
                if (
                    forbidden.some(
                        (specifier) =>
                            match[1] === specifier ||
                            match[1].startsWith(`${specifier}/`)
                    )
                ) {
                    violations.push(
                        `${relative(root, file)} imports ${match[1]}`
                    );
                }
                if (
                    packageName !== "db" &&
                    (match[1].includes("prisma/generated") ||
                        match[1].includes("packages/db/src"))
                ) {
                    violations.push(
                        `${relative(root, file)} bypasses @pomi/db`
                    );
                }
            }
        }
    }

    for (const file of await sourceFiles(join(root, "app", "src", "modules"))) {
        const source = await readFile(file, "utf8");
        violations.push(
            ...checkAppModuleBoundaries(relative(root, file), source)
        );
    }

    const appSource = join(root, "app", "src");
    const mediaSource = join(appSource, "media");
    const mediaPublic = new Set([
        join(mediaSource, "public.js"),
        join(mediaSource, "http.js")
    ]);
    const providerConsumers = new Set([
        join(appSource, "Container.ts"),
        join(mediaSource, "PictRsStorage.ts"),
        join(mediaSource, "cleanup-cli.ts"),
        join(mediaSource, "smoke-cli.ts")
    ]);
    for (const file of await sourceFiles(appSource)) {
        const source = await readFile(file, "utf8");
        for (const match of source.matchAll(
            /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["']([^"']+)["']/g
        )) {
            const specifier = match[1];
            const imported = specifier.startsWith("#/")
                ? resolve(appSource, specifier.slice(2))
                : specifier.startsWith(".")
                  ? resolve(dirname(file), specifier)
                  : undefined;
            if (!imported) continue;
            const path = relative(root, file);
            const insideModules = file.startsWith(
                join(appSource, "modules") + "/"
            );
            const insideMedia = file.startsWith(mediaSource + "/");
            if (
                insideModules &&
                imported.startsWith(mediaSource + "/") &&
                !mediaPublic.has(imported)
            ) {
                violations.push(`${path} bypasses the public media interface`);
            }
            if (
                insideMedia &&
                imported.startsWith(join(appSource, "modules") + "/")
            ) {
                violations.push(`${path} imports a domain module into media`);
            }
            if (
                imported === join(mediaSource, "PictRsClient.js") &&
                !providerConsumers.has(file)
            ) {
                violations.push(`${path} accesses the image provider directly`);
            }
        }
    }

    if (violations.length > 0) {
        throw new Error(
            `Package boundary violations:\n${violations.join("\n")}`
        );
    }
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url))
    await checkPackageBoundaries();
