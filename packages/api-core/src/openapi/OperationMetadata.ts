import type { HttpMethod } from "../http/EndpointContract.js";
import type { PathSegment } from "../PathSegment.js";

function pascalCase(value: string) {
    return value
        .split(/[^a-zA-Z0-9]+/)
        .filter(Boolean)
        .map((part) => part[0]!.toUpperCase() + part.slice(1))
        .join("");
}

function resourceName(path: PathSegment[], tags: string[]) {
    const literals = path
        .filter((segment) => segment.type === "literal")
        .map((segment) => (segment.type === "literal" ? segment.value : ""));
    const resourcePath = literals.join("-");
    return pascalCase(resourcePath || tags[0] || "resource");
}

export function operationIdFromEndpoint(
    method: HttpMethod,
    path: PathSegment[],
    tags: string[]
) {
    const hasMemberParameter = path.at(-1)?.type === "param";
    const resource = resourceName(path, tags);
    const action =
        method === "get"
            ? hasMemberParameter
                ? "get"
                : "list"
            : method === "post"
              ? "create"
              : method === "patch" || method === "put"
                ? "update"
                : method === "delete"
                  ? "delete"
                  : method;
    return `${action}${resource}`;
}

export function operationIdFromOpenApiPath(
    method: HttpMethod,
    path: string,
    tags: string[] = []
) {
    const segments: PathSegment[] = path
        .split("/")
        .filter(Boolean)
        .map((segment) => {
            const parameter = /^\{([^}]+)\}$/.exec(segment);
            return parameter
                ? { type: "param", name: parameter[1]! }
                : { type: "literal", value: segment };
        });
    return operationIdFromEndpoint(method, segments, tags);
}

export function summaryFromOperationId(operationId: string) {
    const match = /^(list|get|create|update|delete)([A-Z].*)$/.exec(
        operationId
    );
    if (!match) return operationId;
    const action = {
        list: "List",
        get: "Get",
        create: "Create",
        update: "Update",
        delete: "Delete"
    }[match[1]!];
    return `${action} ${match[2]}`;
}
