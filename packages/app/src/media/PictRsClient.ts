import { Readable } from "node:stream";
import z from "zod";

const uploadResponseSchema = z.object({
    files: z
        .array(
            z.object({
                file: z
                    .string()
                    .regex(/^[A-Za-z0-9_-]{1,128}\.[A-Za-z0-9]{1,10}$/),
                details: z.object({
                    width: z.number().int().positive(),
                    height: z.number().int().positive(),
                    frames: z.number().int().positive().nullable().optional(),
                    content_type: z.string().max(100),
                    format: z.string().max(20)
                })
            })
        )
        .length(1)
});

const hashPageSchema = z.object({
    page: z.object({
        next: z.string().nullish(),
        hashes: z.array(
            z.object({
                aliases: z.array(z.string()),
                details: z
                    .object({ created_at: z.string().datetime() })
                    .optional()
            })
        )
    })
});

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 + 64 * 1024;
const MAX_JSON_BYTES = 64 * 1024;
const MAX_IMAGE_AREA = 4_000_000;
const MAX_VARIANT_BYTES = 8 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;

const aliasSchema = z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,128}\.(?:jpg|jpeg|png|webp)$/);

export const imagePresets = {
    avatarSmall: 128,
    avatarLarge: 512
} as const;

export type ImagePreset = keyof typeof imagePresets;

export class PictRsError extends Error {
    constructor(
        message: string,
        readonly kind:
            | "invalid-request"
            | "payload-too-large"
            | "invalid-media"
            | "upstream" = "upstream"
    ) {
        super(message);
        this.name = "PictRsError";
    }
}

export type UploadedImage = {
    alias: string;
    width: number;
    height: number;
    contentType: "image/jpeg" | "image/png" | "image/webp";
};

async function readJsonResponse(response: Response) {
    if (!response.body) throw new PictRsError("Resposta vazia do pict-rs.");
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for await (const chunk of response.body) {
        bytes += chunk.byteLength;
        if (bytes > MAX_JSON_BYTES) {
            await response.body.cancel().catch(() => {});
            throw new PictRsError("Resposta grande demais do pict-rs.");
        }
        chunks.push(chunk);
    }
    try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    } catch {
        throw new PictRsError("Resposta inválida do pict-rs.");
    }
}

async function requireSuccess(response: Response, status: number) {
    if (response.status !== status) {
        await response.body?.cancel();
        throw new PictRsError(
            `pict-rs respondeu com status ${response.status}.`
        );
    }
}

export class PictRsClient {
    private readonly baseUrl: URL;

    constructor(
        baseUrl: string,
        private readonly apiKey: string,
        private readonly fetchImpl: typeof fetch = fetch
    ) {
        const parsed = new URL(baseUrl);
        if (
            parsed.protocol !== "http:" ||
            parsed.username ||
            parsed.password ||
            parsed.pathname !== "/" ||
            parsed.search ||
            parsed.hash ||
            !apiKey
        ) {
            throw new Error("Configuração inválida do pict-rs.");
        }
        this.baseUrl = parsed;
    }

    private url(path: string) {
        return new URL(path, this.baseUrl);
    }

    async health(): Promise<void> {
        const response = await this.fetchImpl(this.url("/healthz"), {
            redirect: "manual",
            signal: AbortSignal.timeout(3_000)
        });
        if (response.status !== 200) {
            await response.body?.cancel();
            throw new PictRsError("pict-rs não está pronto.");
        }
        await response.body?.cancel();
    }

    async upload(
        input: Readable,
        contentType: string,
        signal: AbortSignal,
        crop: "none" | "square" = "none"
    ): Promise<UploadedImage> {
        if (
            !/^multipart\/form-data;\s*boundary=[A-Za-z0-9'()+_,./:=?-]{1,70}$/i.test(
                contentType
            )
        ) {
            throw new PictRsError(
                "Content-Type multipart inválido.",
                "invalid-request"
            );
        }
        const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
        const combined = AbortSignal.any([signal, timeout]);
        const onAbort = () =>
            input.destroy(new PictRsError("Upload interrompido."));
        combined.addEventListener("abort", onAbort, { once: true });
        let bodyError: PictRsError | undefined;
        const body = Readable.from(
            (async function* () {
                let bytes = 0;
                for await (const chunk of input) {
                    bytes += Buffer.byteLength(chunk);
                    if (bytes > MAX_UPLOAD_BYTES) {
                        bodyError = new PictRsError(
                            "Upload excede o limite de bytes.",
                            "payload-too-large"
                        );
                        throw bodyError;
                    }
                    yield chunk;
                }
            })()
        );
        const url = this.url("/image");
        if (crop === "square") url.searchParams.set("crop", "1x1");
        url.searchParams.set("allow_animation", "false");
        url.searchParams.set("allow_video", "false");
        url.searchParams.set("max_frame_count", "1");
        url.searchParams.set("max_area", String(MAX_IMAGE_AREA));
        url.searchParams.set("max_file_size", "6");
        try {
            const response = await this.fetchImpl(url, {
                method: "POST",
                headers: { "Content-Type": contentType },
                body: body as unknown as RequestInit["body"],
                duplex: "half",
                redirect: "manual",
                signal: combined
            } as RequestInit & { duplex: "half" });
            if (response.status !== 201) {
                await response.body?.cancel();
                throw new PictRsError(
                    `pict-rs respondeu com status ${response.status}.`,
                    response.status === 413
                        ? "payload-too-large"
                        : response.status === 400 || response.status === 422
                          ? "invalid-media"
                          : "upstream"
                );
            }
            const parsed = uploadResponseSchema.safeParse(
                await readJsonResponse(response)
            );
            if (!parsed.success) {
                throw new PictRsError("Metadados inválidos do pict-rs.");
            }
            const file = parsed.data.files[0]!;
            if (
                !aliasSchema.safeParse(file.file).success ||
                file.details.format !== "Image" ||
                !["image/jpeg", "image/png", "image/webp"].includes(
                    file.details.content_type
                )
            ) {
                throw new PictRsError(
                    "Formato de imagem não permitido.",
                    "invalid-media"
                );
            }
            if (file.details.frames != null && file.details.frames !== 1) {
                throw new PictRsError(
                    "Imagem animada não permitida.",
                    "invalid-media"
                );
            }
            if (file.details.width * file.details.height > MAX_IMAGE_AREA) {
                throw new PictRsError(
                    "Dimensões da imagem excedem o limite.",
                    "invalid-media"
                );
            }
            return {
                alias: file.file,
                width: file.details.width,
                height: file.details.height,
                contentType: file.details
                    .content_type as UploadedImage["contentType"]
            };
        } catch (error) {
            if (bodyError) throw bodyError;
            throw error;
        } finally {
            combined.removeEventListener("abort", onAbort);
            body.destroy();
            if (signal.aborted && !input.readableEnded) input.destroy();
        }
    }

    async deleteAlias(alias: string, signal: AbortSignal): Promise<void> {
        if (!aliasSchema.safeParse(alias).success) {
            throw new PictRsError("Alias inválido.");
        }
        const url = this.url("/internal/delete");
        url.searchParams.set("alias", alias);
        const response = await this.fetchImpl(url, {
            method: "POST",
            headers: { "X-Api-Token": this.apiKey },
            redirect: "manual",
            signal: AbortSignal.any([
                signal,
                AbortSignal.timeout(REQUEST_TIMEOUT_MS)
            ])
        });
        if (response.status !== 200 && response.status !== 404) {
            await response.body?.cancel();
            throw new PictRsError(
                `pict-rs respondeu com status ${response.status}.`
            );
        }
        await response.body?.cancel();
    }

    async readVariant(
        alias: string,
        preset: ImagePreset,
        signal: AbortSignal
    ): Promise<Readable> {
        if (
            !aliasSchema.safeParse(alias).success ||
            !Object.hasOwn(imagePresets, preset)
        ) {
            throw new PictRsError("Variante inválida.");
        }
        const url = this.url("/image/process.webp");
        url.searchParams.set("alias", alias);
        url.searchParams.set("thumbnail", String(imagePresets[preset]));
        const response = await this.fetchImpl(url, {
            redirect: "manual",
            signal: AbortSignal.any([
                signal,
                AbortSignal.timeout(REQUEST_TIMEOUT_MS)
            ])
        });
        if (
            response.status !== 200 ||
            response.headers.get("Content-Type")?.split(";")[0]?.trim() !==
                "image/webp" ||
            !response.body
        ) {
            await response.body?.cancel();
            throw new PictRsError("Variante indisponível do pict-rs.");
        }
        const contentLength = response.headers.get("Content-Length");
        if (contentLength && Number(contentLength) > MAX_VARIANT_BYTES) {
            await response.body.cancel();
            throw new PictRsError("Variante excede o limite de bytes.");
        }
        return Readable.from(
            (async function* () {
                let bytes = 0;
                for await (const chunk of response.body!) {
                    bytes += chunk.byteLength;
                    if (bytes > MAX_VARIANT_BYTES) {
                        throw new PictRsError(
                            "Variante excede o limite de bytes."
                        );
                    }
                    yield chunk;
                }
            })()
        );
    }

    async listAliases(
        slug: string | undefined,
        signal: AbortSignal
    ): Promise<{
        aliases: { alias: string; createdAt?: Date }[];
        next?: string;
    }> {
        const url = this.url("/internal/hashes");
        url.searchParams.set("limit", "100");
        if (slug) url.searchParams.set("slug", slug);
        const response = await this.fetchImpl(url, {
            headers: { "X-Api-Token": this.apiKey },
            redirect: "manual",
            signal: AbortSignal.any([
                signal,
                AbortSignal.timeout(REQUEST_TIMEOUT_MS)
            ])
        });
        await requireSuccess(response, 200);
        const parsed = hashPageSchema.safeParse(
            await readJsonResponse(response)
        );
        if (!parsed.success) {
            throw new PictRsError("Página de hashes inválida do pict-rs.");
        }
        return {
            aliases: parsed.data.page.hashes.flatMap((hash) =>
                hash.aliases.map((alias) => ({
                    alias,
                    ...(hash.details?.created_at
                        ? { createdAt: new Date(hash.details.created_at) }
                        : {})
                }))
            ),
            next: parsed.data.page.next ?? undefined
        };
    }
}
