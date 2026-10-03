import type { NotifierConfig } from "#/Config.js";
import nodemailer from "nodemailer";

export type SendEmailBody = {
    subject: string;
    text: string;
    html?: string;
    headers?: Record<string, string>;
};

export type SendEmailInput = SendEmailBody & {
    from: string;
    to: string | string[];
};

export type SendEmailResult = {
    messageId: string;
    accepted: string[];
    rejected: string[];
};

export type EmailTransport = {
    sendMail: (input: SendEmailInput) => Promise<SendEmailResult>;
};

export function createSmtpTransport(config: NotifierConfig): EmailTransport {
    const transporter = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpPort === 465,
        auth: { user: config.smtpUser, pass: config.smtpPass }
    });

    return {
        async sendMail(input) {
            const info = await transporter.sendMail(input);
            return {
                messageId: info.messageId,
                accepted: info.accepted.map(String),
                rejected: info.rejected.map(String)
            };
        }
    };
}
