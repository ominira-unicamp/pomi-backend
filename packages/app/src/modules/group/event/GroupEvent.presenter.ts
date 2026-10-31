import type { MyPrisma } from "@pomi/db";
const date = (value: Date | null) => value?.toISOString() ?? null;
export const eventInclude = {
    tags: { include: { tag: true }, orderBy: { tagId: "asc" as const } }
};
export type Event = MyPrisma.GroupEventGetPayload<{
    include: typeof eventInclude;
}>;
export function publicEvent(value: Event) {
    return {
        id: value.id,
        groupId: value.groupId,
        name: value.name,
        description: value.description,
        startsAt: date(value.startsAt),
        endsAt: date(value.endsAt),
        location: value.location,
        tags: value.tags.map(({ tag }) => ({
            id: tag.id,
            name: tag.name,
            categoryId: tag.categoryId
        })),
        createdAt: value.createdAt.toISOString(),
        updatedAt: value.updatedAt.toISOString()
    };
}
export function managedEvent(value: Event) {
    return { ...publicEvent(value), status: value.status };
}
