type JsonObject = Record<string, unknown>;

type OpenApiDocument = {
    components?: {
        schemas?: Record<string, unknown>;
    };
};

import type { SdkSchemaMetadata } from "../http/EndpointContract.js";

export function sdkSchemaMetadata(metadata: SdkSchemaMetadata) {
    return { "x-pomi-schema": metadata };
}

function isRecord(value: unknown): value is JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function enrichSdkSchemaMetadata<T extends OpenApiDocument>(
    document: T
) {
    for (const [name, schema] of Object.entries(
        document.components?.schemas ?? {}
    )) {
        if (!isRecord(schema)) continue;
        const metadata = schema["x-pomi-schema"];
        if (!isRecord(metadata)) {
            throw new Error(
                `OpenAPI schema "${name}" must declare x-pomi-schema metadata`
            );
        }
        if (
            typeof metadata.kind !== "string" ||
            typeof metadata.publicName !== "string"
        ) {
            throw new Error(
                `OpenAPI schema "${name}" has incomplete x-pomi-schema metadata`
            );
        }
    }
    return document;
}
