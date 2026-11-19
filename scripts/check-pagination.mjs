import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const memoryPaginationExceptions = new Map([
    [
        "packages/data/src/modules/exchange/exchange-notice/ExchangeNotice.controller.ts",
        {
            calls: 1,
            reason: "Accent-insensitive search is performed after projection."
        }
    ],
    [
        "packages/data/src/modules/catalog/curriculum-suggestion/CurriculumSuggestion.controller.ts",
        { calls: 1, reason: "Public projections use JavaScript text ordering." }
    ],
    [
        "packages/app/src/modules/planning/curriculum/Curriculum.controller.ts",
        {
            calls: 1,
            reason: "Curriculum summaries use JavaScript text ordering."
        }
    ],
    [
        "packages/app/src/modules/student/interests/StudentTagInterest.controller.ts",
        { calls: 1, reason: "Interest names use pt-BR locale ordering." }
    ],
    [
        "packages/app/src/modules/academic/evaluation/professor/ProfessorEvaluation.controller.ts",
        {
            calls: 1,
            reason: "Pending entries expand attempts into unevaluated professors."
        }
    ],
    [
        "packages/app/src/modules/academic/evaluation/summary/EvaluationSummary.controller.ts",
        {
            calls: 2,
            reason: "Publication rules and aggregation precede pagination."
        }
    ]
]);

const memoryHelpers = new Set([
    "buildArrayPaginationResponse",
    "paginateItems"
]);

export function checkMemoryPagination(
    path,
    source,
    exceptions = memoryPaginationExceptions
) {
    const file = ts.createSourceFile(
        path,
        source,
        ts.ScriptTarget.Latest,
        true
    );
    const helpers = new Set(memoryHelpers);
    const namespaces = new Set();
    for (const node of file.statements) {
        if (
            !ts.isImportDeclaration(node) ||
            !ts.isStringLiteral(node.moduleSpecifier)
        )
            continue;
        if (!node.moduleSpecifier.text.startsWith("@pomi/api-core")) continue;
        const bindings = node.importClause?.namedBindings;
        if (bindings && ts.isNamespaceImport(bindings))
            namespaces.add(bindings.name.text);
        if (bindings && ts.isNamedImports(bindings))
            for (const binding of bindings.elements)
                if (
                    memoryHelpers.has(
                        (binding.propertyName ?? binding.name).text
                    )
                )
                    helpers.add(binding.name.text);
    }
    let calls = 0;
    function visit(node) {
        if (ts.isCallExpression(node)) {
            const expression = node.expression;
            if (
                (ts.isIdentifier(expression) && helpers.has(expression.text)) ||
                (ts.isPropertyAccessExpression(expression) &&
                    namespaces.has(expression.expression.getText(file)) &&
                    memoryHelpers.has(expression.name.text))
            )
                calls++;
        }
        ts.forEachChild(node, visit);
    }
    visit(file);
    const allowed = exceptions.get(path)?.calls ?? 0;
    return calls > allowed
        ? [
              `${path}: ${calls} memory pagination calls; ${allowed} explicitly allowed`
          ]
        : [];
}

async function sourceFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    return (
        await Promise.all(
            entries.map(async (entry) => {
                const path = join(directory, entry.name);
                return entry.isDirectory()
                    ? sourceFiles(path)
                    : path.endsWith(".ts")
                      ? [path]
                      : [];
            })
        )
    ).flat();
}

export async function checkPagination(
    root = fileURLToPath(new URL("../", import.meta.url))
) {
    const files = (
        await Promise.all(
            ["app", "data"].map((name) =>
                sourceFiles(join(root, "packages", name, "src"))
            )
        )
    ).flat();
    const violations = (
        await Promise.all(
            files.map(async (path) =>
                checkMemoryPagination(
                    relative(root, path),
                    await readFile(path, "utf8")
                )
            )
        )
    ).flat();
    if (violations.length) throw new Error(violations.join("\n"));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
    await checkPagination();
