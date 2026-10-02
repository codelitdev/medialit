import nodemailer from "nodemailer";
import logger from "./log";

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
    // User and password are optional so Mailpit can receive mail without SMTP auth.
    const user = process.env.EMAIL_USER;
    const transporter = nodemailer.createTransport({
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
    await transporter.sendMail({
        from: process.env.EMAIL_FROM || user || "medialit@localhost",
        to: email,
        subject: "Your MediaLit sign-in code",
        text: `Enter this code to sign in: ${otp}`,
    });
}
