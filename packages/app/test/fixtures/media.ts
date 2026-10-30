import type { ImageStorage, StoredImage } from "#/media/ImageStorage.js";
import { createMediaService } from "#/media/MediaService.js";
import { MediaUploadLimiter } from "#/media/MediaUploadLimiter.js";
import type { ImageUpload } from "#/media/public.js";
import {
    createAppImageResourceRegistry,
    groupAvatarResource,
    studentAvatarResource
} from "#/MediaResources.js";
import type { Principal } from "#/Principal.js";
import type { PrismaClient } from "@pomi/db";
import { Readable } from "node:stream";

export const principal: Principal = {
    authUserId: 9,
    issuer: "test",
    subject: "student",
    email: null,
    roles: new Set(["STUDENT"]),
    capabilities: new Set(),
    studentId: 42
};
export const uploaded: StoredImage = {
    alias: "new.webp",
    width: 300,
    height: 300,
    contentType: "image/webp"
};
export const upload = (): ImageUpload => ({
    stream: Readable.from(["image"]),
    contentType: "multipart/form-data; boundary=example",
    signal: new AbortController().signal
});
export function testStorage(
    overrides: Partial<ImageStorage> = {}
): ImageStorage {
    return {
        health: async () => {},
        upload: async () => uploaded,
        readVariant: async () => Readable.from(["image"]),
        deleteAlias: async () => {},
        listAliases: async () => ({ aliases: [] }),
        ...overrides
    };
}

type Asset = { alias: string; status: string; nextDeleteAt: Date | null };
export function mediaFixture(
    storageOverrides: Partial<ImageStorage> = {},
    limiter = new MediaUploadLimiter(2)
) {
    let state = {
        userStatus: "ACTIVE",
        userStudentId: 42,
        userRoles: ["STUDENT"],
        grant: false,
        canEditGroup: true,
        groupStatus: "ACTIVE",
        publicProfileEnabled: false,
        student: {
            avatarMediaId: "old-id" as string | null,
            avatarRevision: 3
        },
        group: {
            avatarMediaId: "old-group-id" as string | null,
            avatarRevision: 7
        },
        assets: {
            "old-id": {
                alias: "old.webp",
                status: "ACTIVE",
                nextDeleteAt: null
            },
            "old-group-id": {
                alias: "group.webp",
                status: "ACTIVE",
                nextDeleteAt: null
            }
        } as Record<string, Asset>,
        created: 0
    };
    const database = {
        authUser: {
            findUnique: async () => ({
                status: state.userStatus,
                studentId: state.userStudentId,
                roles: state.userRoles.map((role) => ({ role }))
            })
        },
        botGrant: { findFirst: async () => (state.grant ? { id: 1 } : null) },
        groupMembershipRole: {
            findFirst: async () => (state.canEditGroup ? { roleId: 1 } : null)
        },
        student: {
            findUnique: async () => ({ ...state.student }),
            findMany: async ({
                where
            }: {
                where: { avatarMediaId: { in: string[] } };
            }) =>
                state.student.avatarMediaId &&
                where.avatarMediaId.in.includes(state.student.avatarMediaId)
                    ? [
                          {
                              id: 42,
                              avatarMediaId: state.student.avatarMediaId,
                              publicProfileEnabled: state.publicProfileEnabled
                          }
                      ]
                    : [],
            updateMany: async ({
                where,
                data
            }: {
                where: { avatarRevision: number; avatarMediaId: string | null };
                data: { avatarMediaId: string | null };
            }) => {
                if (
                    where.avatarRevision !== state.student.avatarRevision ||
                    where.avatarMediaId !== state.student.avatarMediaId
                )
                    return { count: 0 };
                state.student.avatarMediaId = data.avatarMediaId;
                state.student.avatarRevision += 1;
                return { count: 1 };
            }
        },
        group: {
            findFirst: async () =>
                state.groupStatus === "ACTIVE" ? { ...state.group } : null,
            findMany: async ({
                where
            }: {
                where: { avatarMediaId: { in: string[] } };
            }) =>
                state.group.avatarMediaId &&
                where.avatarMediaId.in.includes(state.group.avatarMediaId)
                    ? [
                          {
                              avatarMediaId: state.group.avatarMediaId,
                              status: state.groupStatus
                          }
                      ]
                    : [],
            updateMany: async ({
                where,
                data
            }: {
                where: { avatarRevision: number; avatarMediaId: string | null };
                data: { avatarMediaId: string | null };
            }) => {
                if (
                    state.groupStatus !== "ACTIVE" ||
                    where.avatarRevision !== state.group.avatarRevision ||
                    where.avatarMediaId !== state.group.avatarMediaId
                )
                    return { count: 0 };
                state.group.avatarMediaId = data.avatarMediaId;
                state.group.avatarRevision += 1;
                return { count: 1 };
            }
        },
        mediaAsset: {
            findUnique: async ({
                where
            }: {
                where: { id?: string; alias?: string };
            }) => {
                if (where.id) return state.assets[where.id] ?? null;
                const entry = Object.entries(state.assets).find(
                    ([, asset]) => asset.alias === where.alias
                );
                return entry ? { id: entry[0], ...entry[1] } : null;
            },
            create: async ({
                data
            }: {
                data: StoredImage & { status?: string; nextDeleteAt?: Date };
            }) => {
                state.created += 1;
                const id = `created-${state.created}`;
                state.assets[id] = {
                    alias: data.alias,
                    status: data.status ?? "ACTIVE",
                    nextDeleteAt: data.nextDeleteAt ?? null
                };
                return { id };
            },
            updateMany: async ({
                where,
                data
            }: {
                where: { id: string; status: string };
                data: { status: string; nextDeleteAt: Date };
            }) => {
                const asset = state.assets[where.id];
                if (!asset || asset.status !== where.status)
                    return { count: 0 };
                Object.assign(asset, data);
                return { count: 1 };
            }
        },
        $transaction: async (work: (db: unknown) => Promise<unknown>) => {
            const before = structuredClone(state);
            try {
                return await work(database);
            } catch (error) {
                state = before;
                throw error;
            }
        }
    } as unknown as PrismaClient;
    const registry = createAppImageResourceRegistry();
    const storage = testStorage(storageOverrides);
    const service = createMediaService({
        prisma: database,
        imageResourceRegistry: registry,
        imageStorage: storage,
        mediaUploadLimiter: limiter
    });
    return {
        service,
        database,
        registry,
        storage,
        state: () => state,
        studentAvatars: service.forResource(studentAvatarResource),
        groupAvatars: service.forResource(groupAvatarResource)
    };
}
