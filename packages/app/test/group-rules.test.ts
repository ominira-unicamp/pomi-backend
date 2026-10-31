import { requirePermission } from "#/modules/group/access/GroupAccess.js";
import {
    planEventPatch,
    validateEventCancellation,
    validateEventDates,
    validateEventEditable,
    validateEventPublication,
    validateEventTags
} from "#/modules/group/event/GroupEvent.rules.js";
import { requireManagerRemains } from "#/modules/group/governance/GroupGovernance.js";
import { serializable } from "#/modules/group/GroupTransaction.js";
import {
    invitationStatus,
    validateInvitationAcceptance
} from "#/modules/group/invitation/GroupInvitation.rules.js";
import {
    validateActiveMembership,
    validateMembershipVisibility,
    validatePositionDates,
    validatePositionOperations,
    validateRoleAssignments
} from "#/modules/group/membership/GroupMembership.rules.js";
import { createGroupMembershipService } from "#/modules/group/membership/GroupMembership.service.js";
import { validateRolePermissions } from "#/modules/group/role/GroupRole.rules.js";
import { ConflictError, ForbiddenError, NotFoundError } from "@pomi/api-core";
import type { PrismaClient } from "@pomi/db";
import assert from "node:assert/strict";
import test from "node:test";

const event = {
    status: "PUBLISHED",
    name: "Evento",
    description: "Descrição",
    startsAt: new Date("2026-10-30T10:00:00Z"),
    endsAt: new Date("2026-10-30T11:00:00Z")
};

test("event patches validate the resulting state while preserving absent and null dates", () => {
    const unchanged = planEventPatch(event, {});
    assert.ok(unchanged.isOk());
    if (unchanged.isOk())
        assert.deepEqual(unchanged.value.startsAt, event.startsAt);
    assert.ok(planEventPatch(event, { startsAt: null }).isErr());
    assert.ok(planEventPatch(event, { name: "  " }).isErr());
    assert.ok(planEventPatch(event, { endsAt: null }).isOk());
    const invalid = planEventPatch(event, { startsAt: "2026-10-30T12:00:00Z" });
    assert.ok(invalid.isErr());
    if (invalid.isErr())
        assert.equal(invalid.error.code, "INVALID_EVENT_DATES");
    assert.ok(
        planEventPatch({ ...event, status: "DRAFT" }, { startsAt: null }).isOk()
    );
});

test("event state transitions and tag operations retain their restrictions", () => {
    assert.ok(validateEventPublication({ ...event, status: "DRAFT" }).isOk());
    assert.ok(validateEventPublication(event).isErr());
    assert.ok(
        validateEventPublication({
            ...event,
            status: "DRAFT",
            description: ""
        }).isErr()
    );
    assert.ok(validateEventEditable("CANCELLED").isErr());
    assert.ok(validateEventCancellation("DRAFT").isErr());
    assert.ok(validateEventCancellation("PUBLISHED").isOk());
    assert.ok(validateEventTags([1], [1]).isErr());
    assert.ok(validateEventTags([1], [2]).isOk());
    assert.ok(validateEventDates(event.startsAt, event.startsAt).isOk());
});

test("invitation validity uses the supplied instant including the expiration boundary", () => {
    const expires = new Date("2026-10-30T12:00:00Z");
    assert.equal(
        invitationStatus("PENDING", expires, new Date(expires.getTime() - 1)),
        "PENDING"
    );
    assert.equal(invitationStatus("PENDING", expires, expires), "EXPIRED");
    assert.equal(invitationStatus("ACCEPTED", expires, expires), "ACCEPTED");
    assert.ok(
        validateInvitationAcceptance("PENDING", expires, expires).isErr()
    );
    assert.ok(
        validateInvitationAcceptance("ACCEPTED", expires, new Date(0)).isErr()
    );
    assert.ok(
        validateInvitationAcceptance("PENDING", expires, new Date(0)).isOk()
    );
});

test("membership rules preserve ended visibility and conflicting operations", () => {
    assert.ok(validateActiveMembership(null).isErr());
    assert.ok(validateMembershipVisibility(null, true).isErr());
    assert.ok(validateMembershipVisibility(null, false).isOk());
    assert.ok(validateRoleAssignments([1, 1]).isErr());
    assert.ok(validatePositionOperations([1, 1]).isErr());
    assert.ok(
        validateRolePermissions(["ROLE_MANAGE"], ["ROLE_MANAGE"]).isErr()
    );
    assert.ok(validateRolePermissions(["ROLE_MANAGE"], []).isOk());
});

test("partial position dates use the previous value and allow an explicit clear", () => {
    const existing = [
        { id: 1, startedAt: event.startsAt, endedAt: event.endsAt }
    ];
    assert.ok(
        validatePositionDates(existing, [
            { id: 1, startedAt: "2026-10-30T12:00:00Z" }
        ]).isErr()
    );
    assert.ok(
        validatePositionDates(existing, [
            { id: 1, startedAt: "2026-10-30T12:00:00Z", endedAt: null }
        ]).isOk()
    );
    assert.ok(
        validatePositionDates(existing, [
            {
                startedAt: "2026-10-30T12:00:00Z",
                endedAt: "2026-10-30T11:00:00Z"
            }
        ]).isErr()
    );
});

test("group access retains alternative permission matching and archived resource precedence", async () => {
    let active = true;
    let granted = true;
    let where: unknown;
    const db = {
        group: { count: async () => (active ? 1 : 0) },
        groupMembershipRole: {
            findFirst: async (input: { where: unknown }) => {
                where = input.where;
                return granted ? { roleId: 1 } : null;
            }
        }
    } as unknown as PrismaClient;
    await requirePermission(db, 7, 42, ["MEMBER_MANAGE", "ROLE_MANAGE"]);
    assert.deepEqual(where, {
        groupId: 7,
        membership: { studentId: 42, activeKey: "ACTIVE" },
        role: {
            permissions: {
                some: { permission: { in: ["MEMBER_MANAGE", "ROLE_MANAGE"] } }
            }
        }
    });
    granted = false;
    await assert.rejects(
        requirePermission(db, 7, 42, "ROLE_MANAGE"),
        ForbiddenError
    );
    active = false;
    await assert.rejects(
        requirePermission(db, 7, 42, "ROLE_MANAGE"),
        NotFoundError
    );
});

test("mixed membership patches require both permissions before any write", async () => {
    const permissions: unknown[] = [];
    const prisma = {
        groupMembership: { findUnique: async () => ({ id: 1, groupId: 7 }) },
        group: { count: async () => 1 },
        groupMembershipRole: {
            findFirst: async (input: {
                where: {
                    role: {
                        permissions: { some: { permission: { in: string[] } } };
                    };
                };
            }) => {
                permissions.push(
                    input.where.role.permissions.some.permission.in
                );
                return permissions.length === 1 ? { roleId: 1 } : null;
            }
        },
        $transaction: async () => assert.fail("Unauthorized mutation started")
    } as unknown as PrismaClient;
    await assert.rejects(
        createGroupMembershipService({ prisma }).patchManagedMembership(42, 1, {
            roles: { add: [1] },
            positions: { add: [{ title: "Cargo" }] }
        }),
        ForbiddenError
    );
    assert.deepEqual(permissions, [["MEMBER_MANAGE"], ["ROLE_MANAGE"]]);
});

test("governance keeps the current exclusion semantics and serializable conflict mapping", async () => {
    let where: unknown;
    await requireManagerRemains(
        {
            groupMembershipRole: {
                findFirst: async (input: { where: unknown }) => {
                    where = input.where;
                    return { membershipId: 1 };
                }
            }
        } as never,
        7,
        undefined,
        [3]
    );
    assert.deepEqual(where, {
        groupId: 7,
        membershipId: undefined,
        membership: { activeKey: "ACTIVE" },
        roleId: { notIn: [3] },
        role: { permissions: { some: { permission: "ROLE_MANAGE" } } }
    });
    await assert.rejects(
        serializable(
            {
                $transaction: async () => {
                    throw { code: "P2034" };
                }
            } as never,
            async () => undefined
        ),
        ConflictError
    );
});
