import {
    Body,
    Container,
    Head,
    Heading,
    Html,
    Preview,
    Section,
    Text
} from "@react-email/components";
import type { ReactNode } from "react";

export const emailColors = {
    canvas: "#F7F3ED",
    charcoal: "#202020",
    ink: "#202020",
    muted: "#6F6964",
    red: "#B14040",
    white: "#FFFFFF",
    border: "#DDD6D0"
} as const;

type EmailLayoutProps = {
    preview: string;
    eyebrow: string;
    title: string;
    children: ReactNode;
    footer?: ReactNode;
};

export function EmailLayout({
    preview,
    eyebrow,
    title,
    children,
    footer
}: EmailLayoutProps) {
    return (
        <Html lang="pt-BR">
            <Head />
            <Preview>{preview}</Preview>
            <Body style={styles.body}>
                <Container style={styles.container}>
                    <Section style={styles.brandBar}>
                        <Text style={styles.wordmark}>POMI</Text>
                    </Section>

                    <Section style={styles.hero}>
                        <Text style={styles.eyebrow}>{eyebrow}</Text>
                        <Heading as="h1" style={styles.heading}>
                            {title}
                        </Heading>
                    </Section>

                    <Section style={styles.content}>{children}</Section>

                    <Section style={styles.footer}>
                        {footer}
                        <Text style={styles.footerText}>
                            POMI · Projeto da Ominira.
                        </Text>
                    </Section>
                </Container>
            </Body>
        </Html>
    );
}

const styles = {
    body: {
        margin: "0",
        padding: "28px 12px",
        backgroundColor: emailColors.canvas,
        color: emailColors.ink,
        fontFamily: '"Outfit", "Segoe UI", Arial, sans-serif'
    },
    container: {
        width: "100%",
        maxWidth: "620px",
        margin: "0 auto",
        border: `2px solid ${emailColors.charcoal}`,
        borderRadius: "20px",
        overflow: "hidden",
        backgroundColor: emailColors.white
    },
    brandBar: {
        padding: "18px 28px",
        borderBottom: `4px solid ${emailColors.red}`,
        backgroundColor: emailColors.charcoal
    },
    wordmark: {
        margin: "0",
        color: emailColors.white,
        fontSize: "24px",
        fontWeight: "800",
        letterSpacing: "-0.04em"
    },
    hero: {
        padding: "28px 32px",
        backgroundColor: emailColors.red
    },
    eyebrow: {
        margin: "0 0 9px",
        color: emailColors.white,
        fontSize: "12px",
        fontWeight: "700",
        letterSpacing: "0.09em",
        textTransform: "uppercase" as const
    },
    heading: {
        margin: "0",
        color: emailColors.white,
        fontFamily: '"Outfit", "Segoe UI", Arial, sans-serif',
        fontSize: "34px",
        fontWeight: "800",
        lineHeight: "1.05",
        letterSpacing: "-0.035em"
    },
    content: {
        padding: "32px"
    },
    footer: {
        padding: "22px 32px",
        borderTop: `1px solid ${emailColors.border}`,
        backgroundColor: emailColors.canvas
    },
    footerText: {
        margin: "0",
        color: emailColors.muted,
        fontSize: "12px",
        lineHeight: "18px"
    }
} as const;

export const emailStyles = {
    paragraph: {
        margin: "0 0 18px",
        color: emailColors.ink,
        fontSize: "16px",
        lineHeight: "25px"
    },
    muted: {
        margin: "16px 0 0",
        color: emailColors.muted,
        fontSize: "13px",
        lineHeight: "20px"
    },
    button: {
        display: "inline-block",
        padding: "12px 18px",
        border: `2px solid ${emailColors.charcoal}`,
        borderRadius: "999px",
        color: emailColors.white,
        backgroundColor: emailColors.red,
        fontSize: "14px",
        fontWeight: "700",
        lineHeight: "20px",
        textDecoration: "none"
    },
    footerLink: {
        display: "block",
        margin: "0 0 12px",
        color: emailColors.red,
        fontSize: "12px",
        lineHeight: "18px",
        textDecoration: "underline"
    }
} as const;
