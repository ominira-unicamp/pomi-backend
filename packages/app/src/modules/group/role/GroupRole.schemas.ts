import z from "zod";
import { groupPermission } from "../Group.schemas.js";

export const rolePatch = z
    .object({
        name: z.string().trim().min(1).max(80).optional(),
        permissions: z
            .object({
                add: z.array(groupPermission).optional(),
                remove: z.array(groupPermission).optional()
            })
            .strict()
            .optional()
    })
    .strict();
export type RolePatch = z.infer<typeof rolePatch>;
