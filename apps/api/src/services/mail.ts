import nodemailer from "nodemailer";
import logger from "./log";

// User and password are optional so Mailpit can receive mail without SMTP auth.
function transport(host: string) {
    const user = process.env.EMAIL_USER;
    return nodemailer.createTransport({
        host,
        port: Number(process.env.EMAIL_PORT) || 587,
        ...(user
            ? {
                  auth: {
                      user,
                      pass: process.env.EMAIL_PASS,
                  },
              }
            : {}),
    });
}

function sender() {
    return (
        process.env.EMAIL_FROM || process.env.EMAIL_USER || "medialit@localhost"
    );
}

export async function sendSignInCode(
    email: string,
    otp: string,
): Promise<void> {
    if (process.env.NODE_ENV !== "production") {
        logger.info({ otp }, "Sign-in code generated");
    }
    const host = process.env.EMAIL_HOST;
    if (!host) {
        if (process.env.NODE_ENV === "production") {
            logger.error("Email is not configured; sign-in code was not sent");
        }
        return;
    }
    await transport(host).sendMail({
        from: sender(),
        to: email,
        subject: "Your MediaLit sign-in code",
        text: `Enter this code to sign in: ${otp}`,
    });
}

/** The addresses in OPERATOR_ALERT_EMAIL (comma-separated). */
export function operatorRecipients(
    env: NodeJS.ProcessEnv = process.env,
): string[] {
    return (env.OPERATOR_ALERT_EMAIL || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
}

/** Emails the operators through the `EMAIL_*` SMTP settings. Outside
 * production it only logs. */
export async function emailOperators(
    to: string[],
    subject: string,
    text: string,
): Promise<void> {
    if (to.length === 0) return;
    if (process.env.NODE_ENV !== "production") {
        logger.info(
            { subject, text },
            "Operator email (not sent outside production)",
        );
        return;
    }
    const host = process.env.EMAIL_HOST;
    if (!host) {
        logger.warn(
            { subject },
            "Operator email not sent: EMAIL_HOST is not set",
        );
        return;
    }
    await transport(host).sendMail({
        from: sender(),
        to: to.join(", "),
        subject,
        text,
    });
}
