import type {
    ImageDatabase,
    ImageReference,
    ImageReferenceSource,
    ImageResource,
    MediaId
} from "./public.js";

export class ImageResourceRegistry {
    private readonly sources = new Map<string, ImageReferenceSource>();

    constructor(resources: readonly ImageReferenceSource[]) {
        if (resources.length === 0)
            throw new Error("Nenhum recurso de imagem registrado.");
        for (const resource of resources) {
            if (this.sources.has(resource.key))
                throw new Error(`Recurso de imagem duplicado: ${resource.key}`);
            this.sources.set(resource.key, resource);
        }
    }

    assertRegistered<Target>(resource: ImageResource<Target>) {
        if (this.sources.get(resource.key) !== resource)
            throw new Error(
                `Recurso de imagem não registrado: ${resource.key}`
            );
    }

    async findReferences(db: ImageDatabase, mediaIds: readonly MediaId[]) {
        const references = new Map<MediaId, ImageReference[]>();
        if (!mediaIds.length) return references;
        const results = await Promise.all(
            [...this.sources.values()].map((source) =>
                source.findReferences({ db, mediaIds })
            )
        );
        for (const reference of results.flat()) {
            const existing = references.get(reference.mediaId) ?? [];
            existing.push(reference);
            references.set(reference.mediaId, existing);
        }
        return references;
    }
}
