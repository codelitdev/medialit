import connectToDatabase from "@/lib/connect-db";
import { hashCode, generateUniquePasscode } from "@/lib/utils";
import verificationToken from "@/models/verification-token";
import { NextRequest } from "next/server";
import { createTransport } from "nodemailer";

export const GET = async (request: NextRequest) => {
    const searchParams = request.nextUrl.searchParams;
    const domain = request.headers.get("host")?.split(".")[0] || "main";
    const email = searchParams.get("email");
    if (!email) {
        return;
    }
    const code = generateUniquePasscode();
    await connectToDatabase();
    await verificationToken.create({
        email,
        code: hashCode(code),
        timestamp: Date.now() + 1000 * 60 * 5,
    });

    const transporter = createTransport({
        host: process.env.EMAIL_HOST,
        port: +(process.env.EMAIL_PORT || 587),
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    try {
        await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: email,
            subject: `Sign in to ${request.headers.get("host")}`,
            html: html({ code }),
        });

        return Response.json({});
    } catch (err: any) {
        return Response.json({}, { status: 500 });
    }
};

function html(params: { code: any }) {
    const { code } = params;
    const color = {
        background: "#f9f9f9",
        text: "#444",
        mainBackground: "#fff",
    };

    return `
  <body style="background: ${color.background};">
    <table width="100%" border="0" cellspacing="20" cellpadding="0"
      style="background: ${color.mainBackground}; max-width: 600px; margin: auto; border-radius: 10px;">
      <tr>
        <td align="center"
          style="padding: 10px 0px; font-size: 22px; font-family: Helvetica, Arial, sans-serif; color: ${color.text};">
          Enter the following code in to the app
          <p><strong>${code}</strong></p>
        </td>
      </tr>
      <tr>
        <td align="center"
          style="padding: 0px 0px 10px 0px; font-size: 16px; line-height: 22px; font-family: Helvetica, Arial, sans-serif; color: ${color.text};">
          If you did not request this email you can safely ignore it.
        </td>
      </tr>
    </table>
  </body>
  `;
}

/** Email Text body (fallback for email clients that don't render HTML, e.g. feature phones) */
function text({ url, host }: { url: string; host: string }) {
    return `Sign in to ${host}\n${url}\n\n`;
}
