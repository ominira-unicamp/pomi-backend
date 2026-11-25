export const AuthRoles = {
    STUDENT: "STUDENT",
    BOT: "BOT",
    ADMIN: "ADMIN"
} as const;
export type AuthRole = (typeof AuthRoles)[keyof typeof AuthRoles];

export const Capabilities = {
    ACADEMIC_WRITE: "ACADEMIC_WRITE"
} as const;
export type Capability = (typeof Capabilities)[keyof typeof Capabilities];
export const UserCapabilities = {
    PROFILE_READ: "USER_PROFILE_READ",
    PROFILE_WRITE: "USER_PROFILE_WRITE",
    HISTORY_READ: "USER_HISTORY_READ",
    HISTORY_WRITE: "USER_HISTORY_WRITE",
    PLANNING_READ: "USER_PLANNING_READ",
    PLANNING_WRITE: "USER_PLANNING_WRITE",
    SOCIAL_READ: "USER_SOCIAL_READ",
    SOCIAL_WRITE: "USER_SOCIAL_WRITE",
    FEEDBACK_READ: "USER_FEEDBACK_READ",
    FEEDBACK_WRITE: "USER_FEEDBACK_WRITE"
} as const;
export type UserCapability =
    (typeof UserCapabilities)[keyof typeof UserCapabilities];

export function raFromDacEmail(email: string | null): string | undefined {
    if (!email) return undefined;
    return /^([a-z])[0-9]{6}@dac\.unicamp\.br$/i.test(email)
        ? email.slice(1, 7)
        : undefined;
}

export type AuthorizationPolicy =
    | { kind: "public" }
    | { kind: "optional-auth" }
    | { kind: "authenticated" }
    | { kind: "admin" }
    | { kind: "capability"; capability: Capability }
    | {
          kind: "user-access";
          userParam: string;
          capability: UserCapability;
          ownerOnly?: boolean;
      }
    | { kind: "academic-registration" };

export const policies = {
    public: { kind: "public" } as const,
    optionalAuth: { kind: "optional-auth" } as const,
    authenticated: { kind: "authenticated" } as const,
    admin: { kind: "admin" } as const,
    capability: (capability: Capability): AuthorizationPolicy => ({
        kind: "capability",
        capability
    }),
    userAccess: (
        userParam: string,
        capability: UserCapability,
        ownerOnly = false
    ): AuthorizationPolicy => ({
        kind: "user-access",
        userParam,
        capability,
        ...(ownerOnly ? { ownerOnly: true } : {})
    }),
    academicRegistration: { kind: "academic-registration" } as const
};
