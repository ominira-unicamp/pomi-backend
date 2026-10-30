import type { Principal } from "#/Principal.js";
import type { MyPrisma } from "@pomi/db";
import type { Readable } from "node:stream";

export type MediaId = string;
export type ImageDatabase = MyPrisma.TransactionClient;
export type ImageSlot = { mediaId: MediaId | null; revision: number };
export type ImageVariant = "avatarSmall" | "avatarLarge";
export const imageProfiles = { avatar: { name: "avatar" as const } } as const;
export type ImageProfile = (typeof imageProfiles)[keyof typeof imageProfiles];
export type ImageUpload = {
    stream: Readable;
    contentType: string | undefined;
    signal: AbortSignal;
};
export type ImageMutationResult = { mediaId: MediaId; revision: number };
export type ImageResourceOperations<Target> = {
    replace(input: {
        actor: Principal | undefined;
        target: Target;
        upload: ImageUpload;
    }): Promise<ImageMutationResult>;
    remove(input: {
        actor: Principal | undefined;
        target: Target;
    }): Promise<{ revision: number }>;
};

type AccessContext = { db: ImageDatabase; actor: Principal | undefined };
export type ImageReference = {
    mediaId: MediaId;
    canRead(context: AccessContext): Promise<boolean>;
};
export type ImageReferenceSource = {
    key: string;
    findReferences(input: {
        db: ImageDatabase;
        mediaIds: readonly MediaId[];
    }): Promise<ImageReference[]>;
};
export type ImageResource<Target> = ImageReferenceSource & {
    profile: ImageProfile;
    authorizeWrite(input: AccessContext & { target: Target }): Promise<void>;
    loadSlot(input: { db: ImageDatabase; target: Target }): Promise<ImageSlot>;
    compareAndSetSlot(input: {
        tx: ImageDatabase;
        target: Target;
        expected: ImageSlot;
        nextMediaId: MediaId | null;
    }): Promise<boolean>;
};

export function defineImageResource<Target, Owner>(definition: {
    key: string;
    profile: ImageProfile;
    authorizeWrite: ImageResource<Target>["authorizeWrite"];
    loadSlot: ImageResource<Target>["loadSlot"];
    compareAndSetSlot: ImageResource<Target>["compareAndSetSlot"];
    findReferences(input: {
        db: ImageDatabase;
        mediaIds: readonly MediaId[];
    }): Promise<{ mediaId: MediaId; owner: Owner }[]>;
    authorizeRead(input: AccessContext & { owner: Owner }): Promise<boolean>;
}): ImageResource<Target> {
    return Object.freeze({
        key: definition.key,
        profile: definition.profile,
        authorizeWrite: definition.authorizeWrite,
        loadSlot: definition.loadSlot,
        compareAndSetSlot: definition.compareAndSetSlot,
        async findReferences(input: {
            db: ImageDatabase;
            mediaIds: readonly MediaId[];
        }) {
            const references = await definition.findReferences(input);
            return references.map(({ mediaId, owner }) => ({
                mediaId,
                canRead: (context: AccessContext) =>
                    definition.authorizeRead({ ...context, owner })
            }));
        }
    });
}
