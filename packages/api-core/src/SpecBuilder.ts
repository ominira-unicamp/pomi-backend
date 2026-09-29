import { PathSegment, pathSeg } from "./PathSegment.js";
import type {
    SdkOperationAction,
    SdkOperationMetadata
} from "./http/EndpointContract.js";

type SdkResourceDefinition = {
    resource: string;
    operationName: string;
    pathParameters?: Record<string, string>;
};

export class SpecBuilder {
    constructor(
        private basePath: PathSegment[],
        private tags: string[],
        private identifier: string,
        private sdkResource: SdkResourceDefinition
    ) {}

    private metadata(action: SdkOperationAction) {
        const operationName = `${action}${this.sdkResource.operationName}`;
        const pathParameterNames = new Set(
            this.basePath.flatMap((segment) =>
                segment.type === "param" ? [segment.name] : []
            )
        );
        if (action === "get" || action === "update" || action === "delete") {
            pathParameterNames.add(this.identifier);
        }
        const pathParameters = Object.fromEntries(
            Object.entries(this.sdkResource.pathParameters ?? {}).filter(
                ([name]) => pathParameterNames.has(name)
            )
        );
        const sdk: SdkOperationMetadata = {
            resource: this.sdkResource.resource,
            method: action,
            action,
            ...(Object.keys(pathParameters).length > 0
                ? { pathParameters }
                : {})
        };
        return { operationId: operationName, sdk };
    }

    get() {
        return {
            method: "get" as const,
            path: this.basePath.concat(pathSeg.param(this.identifier)),
            tags: this.tags,
            ...this.metadata("get")
        };
    }
    list() {
        return {
            method: "get" as const,
            path: this.basePath,
            tags: this.tags,
            ...this.metadata("list")
        };
    }
    create() {
        return {
            method: "post" as const,
            path: this.basePath,
            tags: this.tags,
            ...this.metadata("create")
        };
    }
    patch() {
        return {
            method: "patch" as const,
            path: this.basePath.concat(pathSeg.param(this.identifier)),
            tags: this.tags,
            ...this.metadata("update")
        };
    }
    remove() {
        return {
            method: "delete" as const,
            path: this.basePath.concat(pathSeg.param(this.identifier)),
            tags: this.tags,
            ...this.metadata("delete")
        };
    }
}
