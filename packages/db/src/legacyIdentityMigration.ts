import { Prisma, type AuthRole } from "../prisma/generated/client.js";
import { IdentityConsistencyError } from "./identity.js";

type LegacyPrincipal = {
    id: number;
    kind: "HUMAN" | "SERVICE";
    status: "ACTIVE" | "DISABLED";
    user: { id: number; studentId: number | null } | null;
    serviceAccount: { id: number } | null;
};
export type LegacyIdentityAccount = {
    id: number;
    issuer: string;
    subject: string;
    email: string | null;
    displayName: string | null;
    status: "ACTIVE" | "DISABLED";
    studentId: number | null;
    createdAt: Date | string;
    updatedAt: Date | string;
    roles: { authUserId: number; role: AuthRole }[];
    authIdentity: {
        id: number;
        legacyAuthUserId: number;
        issuer: string;
        subject: string;
        principal: LegacyPrincipal;
    } | null;
};

export function validateLegacyIdentity(account: LegacyIdentityAccount) {
    const identity = account.authIdentity;
    const principal = identity?.principal;
    if (
        !identity ||
        !principal ||
        identity.legacyAuthUserId !== account.id ||
        identity.issuer !== account.issuer ||
        identity.subject !== account.subject ||
        (principal.kind === "HUMAN" &&
            (!principal.user || principal.serviceAccount)) ||
        (principal.kind === "SERVICE" &&
            (!principal.serviceAccount || principal.user)) ||
        (account.studentId !== null &&
            principal.user?.studentId !== account.studentId)
    )
        throw new IdentityConsistencyError();
    return { identity, principal };
}

export async function readLegacyIdentityAccounts(
    tx: Pick<Prisma.TransactionClient, "$queryRaw">
) {
    const [schema] = await tx.$queryRaw<Array<{ available: boolean }>>`
        SELECT to_regclass('app."AuthUser"') IS NOT NULL AS available
    `;
    if (!schema?.available)
        throw new IdentityConsistencyError(
            "AuthUser historical backfill is unavailable after credential migration."
        );
    const rows = await tx.$queryRaw<Array<{ value: LegacyIdentityAccount }>>`
        SELECT (to_jsonb(a) || jsonb_build_object(
            'roles', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.role::text) FROM app."AuthUserRole" r WHERE r."authUserId"=a.id), '[]'::jsonb),
            'authIdentity', CASE WHEN i.id IS NULL THEN NULL ELSE to_jsonb(i) || jsonb_build_object(
                'principal', to_jsonb(p) || jsonb_build_object('user', to_jsonb(u), 'serviceAccount', to_jsonb(s))
            ) END)) AS value
        FROM app."AuthUser" a LEFT JOIN app."AuthIdentity" i ON i."legacyAuthUserId"=a.id
        LEFT JOIN app."Principal" p ON p.id=i."principalId"
        LEFT JOIN app."User" u ON u."principalId"=p.id
        LEFT JOIN app."ServiceAccount" s ON s."principalId"=p.id ORDER BY a.id
    `;
    return rows.map(({ value }) => value);
}
