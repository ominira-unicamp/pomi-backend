type JsonObject = Record<string, unknown>;

type OpenApiDocument = {
    components?: {
        schemas?: Record<string, unknown>;
    };
};

function isRecord(value: unknown): value is JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasProperties(schema: JsonObject, names: string[]) {
    if (!isRecord(schema.properties)) return false;
    const properties = schema.properties;
    return names.every((name) => name in properties);
}

function isProblemSchema(schema: JsonObject) {
    const type = isRecord(schema.properties)
        ? schema.properties.type
        : undefined;
    return (
        isRecord(type) &&
        Array.isArray(type.enum) &&
        type.enum.some(
            (value) =>
                typeof value === "string" &&
                value.startsWith("urn:pomi:problem:")
        )
    );
}

function isNamedProblemSchema(name: string) {
    return (
        name.includes("Problem") || name === "ApiError" || name === "ErrorField"
    );
}

function isPageSchema(schema: JsonObject) {
    if (!isRecord(schema.properties)) return false;
    const properties = schema.properties;
    const data = properties.data;
    const paths = properties._paths;
    const linkPage =
        isRecord(data) &&
        data.type === "array" &&
        isRecord(paths) &&
        hasProperties(paths, ["next"]);
    const numberPage =
        isRecord(properties.items) &&
        properties.items.type === "array" &&
        hasProperties(schema, ["items", "page", "pageSize", "total"]);
    return linkPage || numberPage;
}

function schemaKind(name: string, schema: JsonObject) {
    if (Array.isArray(schema.enum)) return "value-object" as const;
    if (isProblemSchema(schema) || isNamedProblemSchema(name)) {
        return "problem" as const;
    }
    if (isPageSchema(schema)) return "page" as const;
    if (/(Body|Query|Input|Patch|Create|Update)$/.test(name)) {
        return "input" as const;
    }
    if (/(Summary|Eligibility|ListItem|Accepted)$/.test(name)) {
        return "projection" as const;
    }
    return "entity" as const;
}

export function enrichSdkSchemaMetadata<T extends OpenApiDocument>(
    document: T
) {
    for (const [name, schema] of Object.entries(
        document.components?.schemas ?? {}
    )) {
        if (!isRecord(schema)) continue;
        const metadata = {
            kind: schemaKind(name, schema),
            ...(name.endsWith("Entity")
                ? { publicName: name.slice(0, -"Entity".length) }
                : {}),
            ...(isRecord(schema.properties) && "_paths" in schema.properties
                ? { transportFields: ["_paths"] }
                : {})
        };
        schema["x-pomi-schema"] ??= metadata;
    }
    return document;
}
