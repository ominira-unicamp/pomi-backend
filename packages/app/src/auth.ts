import {
    AuthRoles,
    policies,
    raFromDacEmail,
    type AuthorizationPolicy,
    type AuthRole,
    type Capability
} from "#/Authorization.js";
import { hasUserAccess } from "#/modules/identity/User.access.js";
import type { Principal } from "#/Principal.js";
import {
    forbiddenProblem,
    sendProblem,
    unauthenticatedProblem
} from "@pomi/api-core";
import {
    canonicalIdentity,
    canonicalIdentityInclude,
    createCanonicalIdentity,
    runIdentityTransaction
} from "@pomi/db";
import { asValue } from "awilix";
import { NextFunction, Request, Response } from "express";
import * as jose from "jose";
import { match } from "path-to-regexp";
import z from "zod";
export * from "#/Authorization.js";
export type { Principal } from "#/Principal.js";

const disabled = process.env.DISABLED_AUTH === "true";
const isProduction = process.env.NODE_ENV === "production";
const issuer = process.env.KEYCLOAK_ISSUER?.replace(/\/$/, "");
const audience = process.env.KEYCLOAK_AUDIENCE;
const humanClients = new Set(
    (process.env.KEYCLOAK_HUMAN_CLIENT_IDS ?? "pomi-frontend,pomi-token-cli")
        .split(",")
        .map((client) => client.trim())
        .filter(Boolean)
);

if (isProduction && disabled) {
    throw new Error("DISABLED_AUTH cannot be enabled in production.");
}

if ((!issuer || !audience) && !disabled) {
    throw new Error(
        "KEYCLOAK_ISSUER and KEYCLOAK_AUDIENCE are required when authentication is enabled."
    );
}

const keySet = issuer
    ? jose.createRemoteJWKSet(
          new URL(`${issuer}/protocol/openid-connect/certs`)
      )
    : undefined;

type TokenPayload = jose.JWTPayload & {
    azp?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    preferred_username?: string;
};

async function verifyAccessToken(token: string): Promise<TokenPayload> {
    if (!keySet || !issuer || !audience) {
        throw new Error("Authentication is not configured.");
    }

    const { payload } = await jose.jwtVerify(token, keySet, {
        issuer,
        audience,
        algorithms: ["RS256"]
    });

    if (!payload.sub) {
        throw new Error("The access token has no subject.");
    }

    return payload as TokenPayload;
}

export async function resolvePrincipal(payload: TokenPayload, req: Request) {
    const tokenIssuer = payload.iss;
    const subject = payload.sub;
    if (!tokenIssuer || !subject) throw new ForbiddenError();

    let identity = await req.prisma.authIdentity.findUnique({
        where: { issuer_subject: { issuer: tokenIssuer, subject } },
        include: {
            ...canonicalIdentityInclude,
            roles: true,
            capabilities: true
        }
    });

    if (!identity) {
        if (!payload.azp || !humanClients.has(payload.azp))
            throw new ForbiddenError();
        const emailInput =
            typeof payload.email === "string"
                ? payload.email.trim().toLowerCase()
                : undefined;
        const email = z.email().max(320).safeParse(emailInput);
        const displayName =
            typeof payload.name === "string" && payload.name.trim()
                ? payload.name.trim()
                : null;
        identity = await runIdentityTransaction(req.prisma, async (tx) => {
            const existing = await tx.authIdentity.findUnique({
                where: { issuer_subject: { issuer: tokenIssuer, subject } },
                include: {
                    ...canonicalIdentityInclude,
                    roles: true,
                    capabilities: true
                }
            });
            if (existing) return existing;
            return createCanonicalIdentity(
                tx,
                {
                    issuer: tokenIssuer,
                    subject,
                    displayName,
                    email: email.success ? email.data : null,
                    roles: []
                },
                "HUMAN"
            );
        });
    }

    if (identity.status !== "ACTIVE") throw new ForbiddenError();
    const resolved = canonicalIdentity(identity);
    if (resolved.principal.status !== "ACTIVE") throw new ForbiddenError();

    return {
        welcomePending: resolved.principal.user?.welcomePending === true,
        principalId: resolved.principal.id,
        authIdentityId: resolved.identity.id,
        userId: resolved.principal.user?.id ?? null,
        serviceAccountId: resolved.principal.serviceAccount?.id ?? null,
        issuer: identity.issuer,
        subject: identity.subject,
        email: identity.email,
        roles: new Set(identity.roles.map((entry) => entry.role as AuthRole)),
        capabilities: new Set(
            identity.capabilities.map((entry) => entry.capability as Capability)
        ),
        studentId: resolved.principal.user?.studentId ?? null
    } satisfies Principal;
}

type Methods = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
type Rule = {
    method: Methods;
    path: string;
    policy: AuthorizationPolicy;
};

export class ForbiddenError extends Error {
    constructor() {
        super("Forbidden");
    }
}

class AuthRegistry {
    rules: Rule[] = [];
    constructor(authRegistries: AuthRegistry[] = []) {
        for (const registry of authRegistries) {
            this.rules.push(...registry.rules);
        }
    }

    add(method: Methods, path: string, policy: AuthorizationPolicy) {
        this.rules.push({ method, path, policy });
    }

    addException(method: Methods, path: string) {
        this.add(method, path, policies.public);
    }

    addPolicy(method: Methods, path: string, policy: AuthorizationPolicy) {
        this.add(method, path, policy);
    }

    findRule(method: Methods, path: string) {
        for (const rule of this.rules) {
            if (rule.method !== method) continue;
            const fn = match(rule.path, { decode: decodeURIComponent });
            const result = fn(path);
            if (result) return { rule, params: result.params };
        }
        return undefined;
    }

    checkException(method: Methods, path: string): boolean {
        return this.findRule(method, path)?.rule.policy.kind === "public";
    }

    private async authorize(
        principal: Principal | undefined,
        policy: AuthorizationPolicy,
        params: Partial<Record<string, string | string[]>>,
        req: Request
    ) {
        if (
            policy.kind === "public" ||
            policy.kind === "optional-auth" ||
            disabled
        )
            return;
        if (!principal) throw new ForbiddenError();
        if (policy.kind === "authenticated") return;
        if (policy.kind === "admin") {
            if (principal.roles.has(AuthRoles.ADMIN)) return;
            throw new ForbiddenError();
        }
        if (policy.kind === "capability") {
            if (
                principal.roles.has(AuthRoles.ADMIN) ||
                principal.capabilities.has(policy.capability)
            )
                return;
            throw new ForbiddenError();
        }
        if (policy.kind === "academic-registration") {
            const userId = Number(params.userId);
            if (!Number.isSafeInteger(userId) || userId <= 0)
                throw new ForbiddenError();
            if (principal.roles.has(AuthRoles.ADMIN)) return;
            if (
                principal.userId === userId &&
                principal.roles.has(AuthRoles.STUDENT) &&
                raFromDacEmail(principal.email) === req.body?.ra
            )
                return;
            throw new ForbiddenError();
        }

        if (policy.kind === "user-access") {
            const userId = Number(params[policy.userParam]);
            if (!Number.isSafeInteger(userId) || userId <= 0)
                throw new ForbiddenError();
            if (
                policy.ownerOnly &&
                !principal.roles.has(AuthRoles.ADMIN) &&
                principal.userId !== userId
            )
                throw new ForbiddenError();
            if (
                policy.ownerOnly &&
                req.body?.authorAuthIdentityId !== undefined &&
                req.body.authorAuthIdentityId !== principal.authIdentityId
            )
                throw new ForbiddenError();
            if (
                !(await hasUserAccess(
                    req.prisma,
                    principal,
                    userId,
                    policy.capability
                ))
            )
                throw new ForbiddenError();
            return;
        }
        throw new ForbiddenError();
    }

    middleware() {
        return async (req: Request, res: Response, next: NextFunction) => {
            const ruleMatch = this.findRule(req.method as Methods, req.path);
            const policy = ruleMatch?.rule.policy ?? policies.authenticated;
            if (disabled || policy.kind === "public") return next();

            const authHeader = req.headers.authorization;
            if (!authHeader && policy.kind === "optional-auth") return next();
            if (!authHeader || !authHeader.startsWith("Bearer ")) {
                return sendProblem(res, unauthenticatedProblem(req.path));
            }

            let payload: TokenPayload;
            try {
                payload = await verifyAccessToken(authHeader.substring(7));
            } catch {
                return sendProblem(res, unauthenticatedProblem(req.path));
            }

            try {
                const principal = await resolvePrincipal(payload, req);
                req.user = payload;
                req.principal = principal;
                req.scope.register({ principal: asValue(principal) });
                await this.authorize(
                    principal,
                    policy,
                    ruleMatch?.params ?? {},
                    req
                );
                return next();
            } catch (error) {
                if (error instanceof ForbiddenError) {
                    return sendProblem(res, forbiddenProblem(req.path));
                }
                return next(error);
            }
        };
    }
}

export { AuthRegistry, verifyAccessToken };
