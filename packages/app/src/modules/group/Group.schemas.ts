import z from "zod";

export const id = z.number().int().positive();
export const publicTag = z
    .object({ id, name: z.string(), categoryId: id })
    .strict();
export const groupPermission = z.enum([
    "GROUP_EDIT",
    "GROUP_TAG_MANAGE",
    "MEMBER_MANAGE",
    "ROLE_MANAGE",
    "EVENT_CREATE",
    "EVENT_EDIT",
    "EVENT_PUBLISH"
]);
export const operations = <T extends z.ZodType>(value: T) =>
    z
        .object({
            add: z.array(value).optional(),
            remove: z.array(id).optional()
        })
        .strict();
