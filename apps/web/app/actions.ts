"use server";

import { auth, signIn } from "@/auth";
import connectToDatabase from "@/lib/connect-db";
import { SITE_NAME } from "@/lib/constants";
import { generateUniquePasscode, hashCode } from "@/lib/magic-code-utils";
import verificationToken from "@/models/verification-token";
import { AuthError } from "next-auth";
import { cookies } from "next/headers";
import { createTransport } from "nodemailer";

export async function authenticate(
    prevState: Record<string, unknown>,
    formData: FormData
): Promise<{
    success: boolean;
    checked: boolean;
    error?: string;
}> {
    try {
        await signIn("credentials", {
            email: formData.get("email"),
            code: formData.get("code"),
            redirect: false,
        });
        return { success: true, checked: true };
    } catch (error) {
        if (error instanceof AuthError) {
            switch (error.type) {
                case "CredentialsSignin":
                    return {
                        success: false,
                        checked: true,
                        error: "Invalid credentials",
                    };
                default:
                    return {
                        success: false,
                        checked: true,
                        error: "Something went wrong",
                    };
            }
        }
        return { success: false, checked: true, error: (error as any).message };
    }
}

export async function sendCode(
    prevState: Record<string, unknown>,
    formData: FormData
): Promise<{
    success: boolean;
    error?: string;
}> {
    const email = formData.get("email") as string;
    const cookieStore = cookies();
    // const supabase = getSupabase(cookieStore);
    const code = generateUniquePasscode();
    await connectToDatabase();

    await verificationToken.create({
        email,
        code: hashCode(code),
        timestamp: Date.now() + 1000 * 60 * 5,
    });

    // await supabase.from("verification_tokens").delete().eq("email", email);

    // const { error: errorInInsert } = await supabase
    //   .from("verification_tokens")
    //   .insert({
    //     email,
    //     code: hashCode(code),
    //     timestamp: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
    //   });

    // if (errorInInsert) {
    //   return { success: false, error: errorInInsert.message };
    // }

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
            subject: `Your verification code for ${SITE_NAME}`,
            html: `
              Enter the following code in to the app.
              ${code}
              `,
        });

        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

export async function getUser(): Promise<any | null> {
    const session = await auth();
    if (!session || !session.user) {
        return null;
    }
    return session.user;
}
