import assert from "node:assert/strict";
import test from "node:test";

import type { NotifierConfig } from "#/Config.js";
import { MailService } from "#/email/MailService.js";
import type { EmailTransport, SendEmailInput } from "#/email/smtp.js";
import {
    exchangeNoticeDigestEmailTemplate,
    type ExchangeNoticeDigest
} from "#/modules/exchange/ExchangeNoticeDigestEmailTemplate.js";

const config = {
    databaseUrl: "postgresql://localhost/pomi",
    appApiUrl: "https://app.example.test",
    frontendUrl: "https://pomi.example.test",
    unsubscribeSecret: "a".repeat(32),
    cron: "0 */6 * * *",
    pollIntervalMs: 5_000,
    maxAttempts: 5,
    smtpHost: "smtp.example.test",
    smtpPort: 587,
    smtpUser: "pomi@example.test",
    smtpPass: "password",
    smtpFrom: "POMI <pomi@example.test>",
    logLevel: "info"
} satisfies NotifierConfig;

const notices: ExchangeNoticeDigest[] = [
    {
        id: 1,
        number: "EDITAL 12/2026",
        title: "Intercâmbio na Universidade de São Paulo",
        registrationEnd: new Date("2026-10-15T12:00:00.000Z"),
        place: { name: "Universidade de São Paulo" }
    },
    {
        id: 2,
        number: null,
        title: null,
        registrationEnd: null,
        place: null
    }
];

test("builds the exchange digest with HTML, text and unsubscribe headers", async () => {
    const email = await exchangeNoticeDigestEmailTemplate.build({
        notices,
        unsubscribeUrl: "https://app.example.test/unsubscribe?token=abc",
        preferencesUrl: "https://pomi.example.test/editais-de-intercambio"
    });

    assert.equal(email.subject, "2 novos editais de intercâmbio");
    assert.match(email.text, /EDITAL 12\/2026/);
    assert.match(email.text, /Sem número • Sem título/);
    assert.match(email.html ?? "", /POMI/);
    assert.match(email.html ?? "", /Intercâmbio na Universidade de São Paulo/);
    assert.match(email.html ?? "", /Gerenciar notificações/);
    assert.equal(
        email.headers?.["List-Unsubscribe"],
        "<https://app.example.test/unsubscribe?token=abc>"
    );
    assert.equal(
        email.headers?.["List-Unsubscribe-Post"],
        "List-Unsubscribe=One-Click"
    );
    assert.equal(email.headers?.Precedence, "bulk");
});

test("MailService supplies the configured sender and template payload", async () => {
    let sent: SendEmailInput | undefined;
    const transport: EmailTransport = {
        async sendMail(input) {
            sent = input;
            return {
                messageId: "message-id",
                accepted: [String(input.to)],
                rejected: []
            };
        }
    };
    const service = new MailService(config, transport);

    const result = await service.send(
        "student@example.test",
        exchangeNoticeDigestEmailTemplate,
        {
            notices: notices.slice(0, 1),
            unsubscribeUrl: "https://app.example.test/unsubscribe?token=abc",
            preferencesUrl: "https://pomi.example.test/editais-de-intercambio"
        }
    );

    assert.equal(result.messageId, "message-id");
    assert.equal(sent?.from, config.smtpFrom);
    assert.equal(sent?.to, "student@example.test");
    assert.equal(sent?.headers?.Precedence, "bulk");
    assert.match(sent?.html ?? "", /Novos editais/);
});
