import type { AuthRole, Capability } from "./Authorization.js";

export type Principal = {
    principalId: number;
    authIdentityId: number;
    userId: number | null;
    serviceAccountId: number | null;
    issuer: string;
    subject: string;
    email: string | null;
    roles: Set<AuthRole>;
    capabilities: Set<Capability>;
    studentId: number | null;
};
