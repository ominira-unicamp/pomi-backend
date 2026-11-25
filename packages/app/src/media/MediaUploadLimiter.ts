type RateWindow = { count: number; resetAt: number };

export class MediaUploadRateLimitError extends Error {
    constructor(readonly retryAfterSeconds: number) {
        super(
            "Há muitos uploads de imagem. Aguarde antes de tentar novamente."
        );
    }
}

export class MediaUploadLimiter {
    private active = 0;
    private readonly windows = new Map<number, RateWindow>();

    constructor(
        private readonly maximum: number,
        private readonly rateMaximum = 10,
        private readonly windowMilliseconds = 15 * 60 * 1000
    ) {}

    acquire(principalId: number, now = Date.now()) {
        if (this.active >= this.maximum) {
            throw new MediaUploadRateLimitError(1);
        }
        const current = this.windows.get(principalId);
        if (current && current.resetAt > now) {
            if (current.count >= this.rateMaximum) {
                throw new MediaUploadRateLimitError(
                    Math.max(1, Math.ceil((current.resetAt - now) / 1000))
                );
            }
            current.count += 1;
        } else {
            if (!current && this.windows.size >= 10_000) {
                for (const [id, window] of this.windows) {
                    if (window.resetAt <= now) this.windows.delete(id);
                }
                if (this.windows.size >= 10_000) {
                    throw new MediaUploadRateLimitError(60);
                }
            }
            this.windows.set(principalId, {
                count: 1,
                resetAt: now + this.windowMilliseconds
            });
        }
        this.active += 1;
        let released = false;
        return () => {
            if (released) return;
            released = true;
            this.active -= 1;
        };
    }
}
