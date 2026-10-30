import type { Readable } from "node:stream";
import type { ImageProfile, ImageUpload, ImageVariant } from "./public.js";

export type StoredImage = {
    alias: string;
    width: number;
    height: number;
    contentType: "image/jpeg" | "image/png" | "image/webp";
};

export class ImageStorageError extends Error {
    constructor(
        readonly kind:
            | "invalid-request"
            | "payload-too-large"
            | "invalid-media"
            | "upstream"
    ) {
        super("Falha no armazenamento de imagens.");
    }
}

export interface ImageStorage {
    health(): Promise<void>;
    upload(input: ImageUpload, profile: ImageProfile): Promise<StoredImage>;
    readVariant(
        alias: string,
        variant: ImageVariant,
        signal: AbortSignal
    ): Promise<Readable>;
    deleteAlias(alias: string, signal: AbortSignal): Promise<void>;
    listAliases(
        cursor: string | undefined,
        signal: AbortSignal
    ): Promise<{
        aliases: { alias: string; createdAt?: Date }[];
        next?: string;
    }>;
}
