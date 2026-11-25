import { type IO, OutputBuilder } from "#/Contract.js";
import {
    getPaginatedSchema,
    pathSeg,
    unpaginatedByDefault
} from "@pomi/api-core";
import z from "zod";
import {
    entityMeta,
    groupResourceQuery,
    id,
    listQuery,
    sidId,
    studentBase,
    studentMeta,
    userGroupBase,
    userGroupPath,
    userId
} from "../Group.http.js";
import { ownMembership } from "../membership/GroupMembership.contract.js";

export const invitation = z
    .object({
        id,
        groupId: id,
        recipientUserId: id,
        inviterUserId: id,
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
        ...studentMeta({
            operationId: "listGroupInvitations",
            method: "get",
            path: studentBase("group-invitations"),
            sdkAction: "list",
            queryFeatures: { filter: true },
            capability: "USER_PROFILE_READ"
        }),
        pagination: unpaginatedByDefault
    },
    request: z.object({ path: userId, query: listQuery }),
    response: new OutputBuilder()
        .ok(getPaginatedSchema(invitation), "Convites recebidos")
        .build()
} satisfies IO;
export const listManagedInvitations = {
    meta: {
        ...studentMeta({
            operationId: "listManagedGroupInvitations",
            method: "get",
            path: userGroupBase("invitations"),
            sdkAction: "list",
            queryFeatures: { filter: false },
            capability: "USER_PROFILE_READ"
        }),
        pagination: unpaginatedByDefault
    },
    request: z.object({ path: userGroupPath, query: groupResourceQuery }),
    response: new OutputBuilder()
        .ok(
            getPaginatedSchema(managedInvitation),
            "Convites enviados pelo grupo"
        )
        .build()
} satisfies IO;
export const createInvitation = {
    meta: studentMeta({
        operationId: "createGroupInvitation",
        method: "post",
        path: userGroupBase("invitations"),
        sdkAction: "create",
        queryFeatures: { filter: false },
        capability: "USER_PROFILE_WRITE"
    }),
    request: z.object({
        path: userGroupPath,
        body: z.object({ recipientPublicId: z.string().uuid() }).strict()
    }),
    response: new OutputBuilder().created(invitation, "Convite criado").build()
} satisfies IO;
export const acceptInvitation = {
    meta: studentMeta({
        operationId: "acceptGroupInvitation",
        method: "post",
        path: [
            ...studentBase("group-invitations"),
            pathSeg.param("id"),
            pathSeg.literal("accept")
        ],
        sdkAction: "create",
        queryFeatures: { filter: false },
        capability: "USER_PROFILE_WRITE"
    }),
    request: z.object({ path: sidId }),
    response: new OutputBuilder()
        .ok(ownMembership, "Convite aceito")
        .notFound()
        .build()
} satisfies IO;
export const declineInvitation = {
    meta: studentMeta({
        operationId: "declineGroupInvitation",
        method: "post",
        path: [
            ...studentBase("group-invitations"),
            pathSeg.param("id"),
            pathSeg.literal("decline")
        ],
        sdkAction: "create",
        queryFeatures: { filter: false },
        capability: "USER_PROFILE_WRITE"
    }),
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
