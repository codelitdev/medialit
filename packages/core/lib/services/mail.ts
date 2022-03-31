import nodemailer from "nodemailer";
import {
    mailHost,
    mailUser,
    mailPass,
    mailFrom,
    mailPort,
} from "../config/constants";
import logger from "./log";

export const send = async ({
    to,
    subject,
    body,
}: {
    to: string;
    subject: string;
    body: string;
}) => {
    const transporter = nodemailer.createTransport({
        host: mailHost,
        port: mailPort,
        auth: {
            user: mailUser,
            pass: mailPass,
        },
    });

    try {
        await transporter.sendMail({
            from: mailFrom,
            to,
            subject,
            html: body,
        });
    } catch (err: any) {
        logger.error({ err }, err.message);
    }
};
