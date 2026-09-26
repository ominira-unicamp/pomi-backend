import assert from "node:assert/strict";
import test from "node:test";

import { loadNotifierConfig } from "#/Config.js";

test("uses the six-hour cron by default", () => {
    const config = loadNotifierConfig({
        DATABASE_URL: "postgresql://localhost/pomi",
        POMI_APP_API_URL: "https://app.example.test",
        POMI_FRONTEND_URL: "https://pomi.example.test",
        NOTIFIER_UNSUBSCRIBE_SECRET: "a".repeat(32),
        SMTP_HOST: "smtp.example.test",
        SMTP_USER: "pomi@example.test",
        SMTP_PASS: "password"
    });

    assert.equal(config.cron, "0 */6 * * *");
    assert.equal(config.smtpFrom, "pomi@example.test");
});
