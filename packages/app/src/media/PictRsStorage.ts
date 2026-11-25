import { ImageStorageError, type ImageStorage } from "./ImageStorage.js";
import { PictRsClient, PictRsError } from "./PictRsClient.js";

async function normalize<T>(operation: () => Promise<T>): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        throw new ImageStorageError(
            error instanceof PictRsError ? error.kind : "upstream"
        );
    }
}

export function createPictRsStorage(client: PictRsClient): ImageStorage {
    return {
        health: () => normalize(() => client.health()),
        upload: (input, profile) =>
            normalize(() =>
                client.upload(
                    input.stream,
                    input.contentType ?? "",
                    input.signal,
                    profile.name === "avatar" ? "square" : "none"
                )
            ),
        readVariant: (alias, variant, signal) =>
            normalize(() => client.readVariant(alias, variant, signal)),
        deleteAlias: (alias, signal) =>
            normalize(() => client.deleteAlias(alias, signal)),
        listAliases: (cursor, signal) =>
            normalize(() => client.listAliases(cursor, signal))
    };
}
