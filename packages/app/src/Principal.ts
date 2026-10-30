import type { AuthRole, Capability } from "./Authorization.js";

export type Principal = {
    authUserId: number;
    issuer: string;
    subject: string;
    email: string | null;
    roles: Set<AuthRole>;
    capabilities: Set<Capability>;
    studentId: number | null;
};
