import z from "zod";

const appConfigSchema = z
    .object({
        databaseUrl: z.string().min(1),
        corsOrigins: z.string().optional(),
        port: z.coerce.number().int().min(1).max(65535).default(3001),
        disabledAuth: z.boolean().default(false),
        keycloakIssuer: z.string().url().optional(),
        keycloakAudience: z.string().min(1).optional(),
        feedbackRateLimitMax: z.coerce.number().int().min(1).default(10),
        feedbackRateLimitWindowSeconds: z.coerce
            .number()
            .int()
            .min(1)
            .default(900),
        mediaUploadRateLimitMax: z.coerce.number().int().min(1).default(10),
        mediaUploadRateLimitWindowSeconds: z.coerce
            .number()
            .int()
            .min(1)
            .default(900),
        notifierUnsubscribeSecret: z.string().min(32).optional(),
        pictRsUrl: z.string().url().optional(),
        pictRsApiKey: z.string().min(32).optional(),
        nodeEnv: z
            .enum(["development", "test", "production"])
            .default("development")
    })
    .superRefine((config, context) => {
        if (config.nodeEnv === "production" && config.disabledAuth) {
            context.addIssue({
                code: "custom",
                path: ["disabledAuth"],
                message: "DISABLED_AUTH cannot be enabled in production."
            });
        }
        if (
            !config.disabledAuth &&
            (!config.keycloakIssuer || !config.keycloakAudience)
        ) {
            context.addIssue({
                code: "custom",
                path: ["keycloakIssuer"],
                message:
                    "KEYCLOAK_ISSUER and KEYCLOAK_AUDIENCE are required when authentication is enabled."
            });
        }
        if (Boolean(config.pictRsUrl) !== Boolean(config.pictRsApiKey)) {
            context.addIssue({
                code: "custom",
                path: ["pictRsUrl"],
                message:
                    "PICTRS_URL and PICTRS_API_KEY must be configured together."
            });
        }
    });

export type AppConfig = z.infer<typeof appConfigSchema>;

export function loadAppConfig(environment: NodeJS.ProcessEnv): AppConfig {
    return appConfigSchema.parse({
        databaseUrl: environment.DATABASE_URL,
        corsOrigins: environment.CORS_ORIGINS ?? environment.CORS_ORIGIN,
        port: environment.PORT ?? environment.POMI_APP_PORT,
        disabledAuth: environment.DISABLED_AUTH === "true",
        keycloakIssuer: environment.KEYCLOAK_ISSUER?.replace(/\/$/, ""),
        keycloakAudience: environment.KEYCLOAK_AUDIENCE,
        feedbackRateLimitMax: environment.FEEDBACK_RATE_LIMIT_MAX,
        feedbackRateLimitWindowSeconds:
            environment.FEEDBACK_RATE_LIMIT_WINDOW_SECONDS,
        mediaUploadRateLimitMax: environment.MEDIA_UPLOAD_RATE_LIMIT_MAX,
        mediaUploadRateLimitWindowSeconds:
            environment.MEDIA_UPLOAD_RATE_LIMIT_WINDOW_SECONDS,
        notifierUnsubscribeSecret: environment.NOTIFIER_UNSUBSCRIBE_SECRET,
        pictRsUrl: environment.PICTRS_URL,
        pictRsApiKey: environment.PICTRS_API_KEY,
        nodeEnv: environment.NODE_ENV
    });
}
