import { systemClock, type Clock } from "#/application/Clock.js";
export type FeedbackLimitDefinition = Readonly<{
    maximum: number;
    windowMilliseconds: number;
}>;

type Entry = { count: number; resetAt: number };

export class FeedbackRateLimiter {
    private readonly entries = new Map<string, Entry>();

    private readonly maximum: number;
    private readonly windowMilliseconds: number;
    constructor(
        { maximum, windowMilliseconds }: FeedbackLimitDefinition,
        private readonly clock: Clock = systemClock
    ) {
        this.maximum = maximum;
        this.windowMilliseconds = windowMilliseconds;
        if (
            !Number.isSafeInteger(maximum) ||
            maximum < 1 ||
            !Number.isSafeInteger(windowMilliseconds) ||
            windowMilliseconds < 1
        )
            throw new RangeError(
                "O limite e a janela de feedback devem ser inteiros positivos."
            );
    }

    consume(key: string, now = this.clock.now().getTime()) {
        const current = this.entries.get(key);
        if (!current || current.resetAt <= now) {
            this.entries.set(key, {
                count: 1,
                resetAt: now + this.windowMilliseconds
            });
            return { allowed: true as const };
        }
        if (current.count >= this.maximum)
            return {
                allowed: false as const,
                retryAfterSeconds: Math.max(
                    1,
                    Math.ceil((current.resetAt - now) / 1000)
                )
            };
        current.count += 1;
        return { allowed: true as const };
    }
}
