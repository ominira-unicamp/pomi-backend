import type { MyPrisma } from "@pomi/db";
export const roleInclude = { permissions: true };
export type Role = MyPrisma.GroupRoleGetPayload<{
    include: typeof roleInclude;
}>;
export function role(value: Role) {
    return {
        id: value.id,
        groupId: value.groupId,
        name: value.name,
        permissions: value.permissions.map(({ permission }) => permission)
    };
}
