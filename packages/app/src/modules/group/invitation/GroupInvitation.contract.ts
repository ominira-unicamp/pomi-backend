import { type IO, OutputBuilder } from "#/Contract.js";
import {
    getPaginatedSchema,
    pathSeg,
    unpaginatedByDefault
} from "@pomi/api-core";
import z from "zod";
import {
    entityMeta,
    groupQuery,
    id,
    listQuery,
    sid,
    sidId,
    studentBase,
    studentMeta
} from "../GroupContractSupport.js";
import { ownMembership } from "../membership/GroupMembership.contract.js";

export const invitation = z
    .object({
        id,
        groupId: id,
        recipientStudentId: id,
        inviterStudentId: id,
        status: z.enum([
            "PENDING",
            "ACCEPTED",
            "DECLINED",
            "CANCELLED",
            "EXPIRED"
        ]),
        expiresAt: z.string().datetime(),
        createdAt: z.string().datetime(),
        respondedAt: z.string().datetime().nullable()
    })
    .strict()
    .openapi("GroupInvitation", entityMeta("GroupInvitation"));
export const managedInvitation = invitation
    .extend({
        recipientName: z.string(),
        recipientPublicId: z.string().uuid(),
        recipientAvatarMediaId: z.uuid().nullable()
    })
    .strict()
    .openapi("ManagedGroupInvitation", entityMeta("ManagedGroupInvitation"));
export const listInvitations = {
    meta: {
        ...studentMeta(
            "listGroupInvitations",
            "get",
            studentBase("group-invitations")
        ),
        pagination: unpaginatedByDefault
    },
    request: z.object({ path: sid, query: listQuery }),
    response: new OutputBuilder()
        .ok(getPaginatedSchema(invitation), "Convites recebidos")
        .build()
} satisfies IO;
export const listManagedInvitations = {
    meta: {
        ...studentMeta(
            "listManagedGroupInvitations",
            "get",
            studentBase("managed-group-invitations")
        ),
        pagination: unpaginatedByDefault
    },
    request: z.object({ path: sid, query: listQuery }),
    response: new OutputBuilder()
        .ok(
            getPaginatedSchema(managedInvitation),
            "Convites enviados pelo grupo"
        )
        .build()
} satisfies IO;
export const createInvitation = {
    meta: studentMeta(
        "createGroupInvitation",
        "post",
        studentBase("group-invitations"),
        true
    ),
    request: z.object({
        path: sid,
        query: groupQuery,
        body: z.object({ recipientPublicId: z.string().uuid() }).strict()
    }),
    response: new OutputBuilder().created(invitation, "Convite criado").build()
} satisfies IO;
export const acceptInvitation = {
    meta: studentMeta(
        "acceptGroupInvitation",
        "post",
        [
            ...studentBase("group-invitations"),
            pathSeg.param("id"),
            pathSeg.literal("accept")
        ],
        true
    ),
    request: z.object({ path: sidId }),
    response: new OutputBuilder()
        .ok(ownMembership, "Convite aceito")
        .notFound()
        .build()
} satisfies IO;
export const declineInvitation = {
    meta: studentMeta(
        "declineGroupInvitation",
        "post",
        [
            ...studentBase("group-invitations"),
            pathSeg.param("id"),
            pathSeg.literal("decline")
        ],
        true
    ),
    request: z.object({ path: sidId }),
    response: new OutputBuilder()
        .noContent("Convite recusado")
        .notFound()
        .build()
} satisfies IO;
export default {
    listInvitations,
    listManagedInvitations,
    createInvitation,
    acceptInvitation,
    declineInvitation
};
