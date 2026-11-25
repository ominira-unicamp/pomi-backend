import { Button, Link, Section, Text } from "@react-email/components";
import { render } from "@react-email/render";

import { EmailLayout, emailColors, emailStyles } from "#/email/EmailLayout.js";
import type { SendEmailBody } from "#/email/smtp.js";

export type ExchangeNoticeDigest = {
    id: number;
    number: string | null;
    title: string | null;
    registrationEnd: Date | null;
    place: { name: string } | null;
};

export type ExchangeNoticeDigestEmailData = {
    notices: ExchangeNoticeDigest[];
    unsubscribeUrl: string;
    preferencesUrl: string;
};

async function build({
    notices,
    unsubscribeUrl,
    preferencesUrl
}: ExchangeNoticeDigestEmailData): Promise<SendEmailBody> {
    return {
        subject: `${notices.length} ${notices.length === 1 ? "novo edital" : "novos editais"} de intercâmbio`,
        text: buildText(notices, unsubscribeUrl, preferencesUrl),
        html: await render(
            <ExchangeNoticeDigestEmail
                notices={notices}
                unsubscribeUrl={unsubscribeUrl}
                preferencesUrl={preferencesUrl}
            />
        ),
        headers: {
            "List-Unsubscribe": `<${unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            "Precedence": "bulk"
        }
    };
}

function buildText(
    notices: ExchangeNoticeDigest[],
    unsubscribeUrl: string,
    preferencesUrl: string
): string {
    return [
        "Olá!",
        "",
        "Novos editais de acordo com suas preferências:",
        "",
        ...notices.map(formatTextItem),
        "",
        "---",
        "Para gerenciar suas preferências:",
        preferencesUrl,
        "",
        "Para cancelar estas notificações:",
        unsubscribeUrl,
        "",
        "Mensagem gerada automaticamente pelo POMI."
    ].join("\n");
}

function ExchangeNoticeDigestEmail({
    notices,
    unsubscribeUrl,
    preferencesUrl
}: {
    notices: ExchangeNoticeDigest[];
    unsubscribeUrl: string;
    preferencesUrl: string;
}) {
    return (
        <EmailLayout
            preview={`${notices.length} ${notices.length === 1 ? "edital aberto encontrado" : "editais abertos encontrados"}`}
            eyebrow="Atualização de editais"
            title="Novos editais"
            footer={
                <Link href={unsubscribeUrl} style={emailStyles.footerLink}>
                    Cancelar notificações
                </Link>
            }
        >
            <Text style={emailStyles.paragraph}>
                Há{" "}
                <strong>
                    {notices.length}{" "}
                    {notices.length === 1 ? "edital" : "editais"}
                </strong>{" "}
                de acordo com suas preferências:
            </Text>

            {notices.map((notice) => (
                <NoticeCard key={notice.id} notice={notice} />
            ))}

            <Section style={digestStyles.actions}>
                <Button href={preferencesUrl} style={emailStyles.button}>
                    Gerenciar notificações
                </Button>
            </Section>
        </EmailLayout>
    );
}

function NoticeCard({ notice }: { notice: ExchangeNoticeDigest }) {
    return (
        <Section style={digestStyles.card}>
            <Text style={digestStyles.number}>
                {notice.number ?? "Sem número"}
            </Text>
            <Text style={digestStyles.title}>
                {notice.title ?? "Sem título"}
            </Text>
            {notice.place && (
                <Text style={digestStyles.meta}>
                    Local: {notice.place.name}
                </Text>
            )}
            {notice.registrationEnd && (
                <Text style={digestStyles.meta}>
                    Inscrições até {formatDate(notice.registrationEnd)}
                </Text>
            )}
        </Section>
    );
}

function formatTextItem(notice: ExchangeNoticeDigest): string {
    return [
        notice.number ?? "Sem número",
        notice.title ?? "Sem título",
        notice.place?.name,
        notice.registrationEnd && `até ${formatDate(notice.registrationEnd)}`
    ]
        .filter(Boolean)
        .join(" • ");
}

function formatDate(date: Date): string {
    return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short"
    }).format(date);
}

export const exchangeNoticeDigestEmailTemplate = {
    name: "exchange_notice_digest",
    build
};

const digestStyles = {
    card: {
        margin: "0 0 14px",
        padding: "18px 20px",
        border: `1px solid ${emailColors.border}`,
        borderLeft: `5px solid ${emailColors.red}`,
        borderRadius: "12px",
        backgroundColor: emailColors.canvas
    },
    number: {
        margin: "0 0 6px",
        color: emailColors.red,
        fontSize: "12px",
        fontWeight: "700",
        letterSpacing: "0.06em",
        lineHeight: "18px",
        textTransform: "uppercase" as const
    },
    title: {
        margin: "0 0 10px",
        color: emailColors.ink,
        fontSize: "17px",
        fontWeight: "700",
        lineHeight: "23px"
    },
    meta: {
        margin: "2px 0 0",
        color: emailColors.muted,
        fontSize: "13px",
        lineHeight: "19px"
    },
    actions: {
        paddingTop: "12px"
    }
} as const;
