import type { NotifierConfig } from "#/Config.js";

import {
    createSmtpTransport,
    EmailTransport,
    SendEmailBody,
    SendEmailResult
} from "#/email/smtp.js";

export type EmailTemplate<T = unknown> = {
    name: string;
    build: (data: T) => Promise<SendEmailBody>;
};

export class MailService {
    private readonly from: string;

    constructor(
        config: NotifierConfig,
        private readonly transport: EmailTransport = createSmtpTransport(config)
    ) {
        this.from = config.smtpFrom;
    }

    async send<T>(
        address: string,
        template: EmailTemplate<T>,
        data: T
    ): Promise<SendEmailResult> {
        const payload = await template.build(data);
        return this.transport.sendMail({
            to: address,
            from: this.from,
            ...payload
        });
    }
}
