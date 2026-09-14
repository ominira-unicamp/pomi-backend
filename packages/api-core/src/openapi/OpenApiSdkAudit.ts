type JsonObject = Record<string, unknown>;

type OpenApiDocument = {
    paths?: Record<string, unknown>;
    components?: { schemas?: Record<string, unknown> };
};

const operationMethods = new Set(["get", "put", "post", "patch", "delete"]);
const sdkActions = new Set(["list", "get", "create", "update", "delete"]);

function isRecord(value: unknown): value is JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(value: JsonObject, field: string) {
    return typeof value[field] === "string" ? value[field] : undefined;
}

export function assertOpenApiSdkCoverage(document: OpenApiDocument) {
    const operationIds = new Set<string>();
    const sdkMethods = new Set<string>();

    for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
        if (!isRecord(pathItem)) continue;
        for (const [method, value] of Object.entries(pathItem)) {
            if (!operationMethods.has(method) || !isRecord(value)) continue;
            const operationId = stringField(value, "operationId");
            if (!operationId) {
                throw new Error(
                    `${method.toUpperCase()} ${path} has no operationId`
                );
            }
            if (operationIds.has(operationId)) {
                throw new Error(
                    `Duplicate OpenAPI operationId "${operationId}"`
                );
            }
            operationIds.add(operationId);

            const sdk = value["x-pomi-sdk"];
            if (!isRecord(sdk)) {
                if (sdk === false && value.deprecated === true) continue;
                throw new Error(
                    `${operationId} must declare x-pomi-sdk metadata`
                );
            }
            const resource = stringField(sdk, "resource");
            const sdkMethod = stringField(sdk, "method");
            const action = stringField(sdk, "action");
            if (!resource || !sdkMethod || !action || !sdkActions.has(action)) {
                throw new Error(
                    `${operationId} has incomplete x-pomi-sdk metadata`
                );
            }
            if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(resource)) {
                throw new Error(
                    `${operationId} has invalid SDK resource "${resource}"`
                );
            }
            if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(sdkMethod)) {
                throw new Error(
                    `${operationId} has invalid SDK method "${sdkMethod}"`
                );
            }
            const sdkKey = `${resource}.${sdkMethod}`;
            if (sdkMethods.has(sdkKey)) {
                throw new Error(`Duplicate SDK operation "${sdkKey}"`);
            }
            sdkMethods.add(sdkKey);

            const expectedPathParameters = [
                ...path.matchAll(/\{([^}]+)\}/g)
            ].map((match) => match[1]!);
            const pathParameters = isRecord(sdk.pathParameters)
                ? Object.keys(sdk.pathParameters)
                : [];
            if (
                expectedPathParameters.length !== pathParameters.length ||
                expectedPathParameters.some(
                    (parameter) => !pathParameters.includes(parameter)
                )
            ) {
                throw new Error(
                    `${operationId} must map every path parameter in x-pomi-sdk`
                );
            }
        }
    }

    for (const [name, value] of Object.entries(
        document.components?.schemas ?? {}
    )) {
        if (!isRecord(value)) continue;
        const metadata = value["x-pomi-schema"];
        if (!isRecord(metadata)) {
            throw new Error(`OpenAPI schema "${name}" has no x-pomi-schema`);
        }
        const properties = isRecord(value.properties) ? value.properties : {};
        for (const field of [
            ...(Array.isArray(metadata.transportFields)
                ? metadata.transportFields
                : []),
            ...(Array.isArray(metadata.identityFields)
                ? metadata.identityFields
                : []),
            ...(Array.isArray(metadata.readOnlyFields)
                ? metadata.readOnlyFields
                : []),
            ...Object.keys(
                isRecord(metadata.relations) ? metadata.relations : {}
            )
        ]) {
            if (typeof field !== "string" || !(field in properties)) {
                throw new Error(
                    `OpenAPI schema "${name}" metadata references missing field "${String(field)}"`
                );
            }
        }
    }
}
