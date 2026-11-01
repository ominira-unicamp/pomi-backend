import z from "zod";
import { id, operations } from "../Group.schemas.js";

export const positionInput = z
    .object({
        title: z.string().trim().min(1).max(120),
        startedAt: z.iso.datetime({ offset: true }).nullable().optional(),
        endedAt: z.iso.datetime({ offset: true }).nullable().optional(),
        sortOrder: z.number().int().optional()
    })
    .strict();
export const memberPatch = z
    .object({
        positions: z
            .object({
                add: z.array(positionInput).optional(),
                update: z
                    .array(positionInput.partial().extend({ id }))
                    .optional(),
                remove: z.array(id).optional()
            })
            .strict()
            .optional(),
        roles: operations(id).optional(),
        leave: z.boolean().optional()
    })
    .strict();
export type MemberPatch = z.infer<typeof memberPatch>;
