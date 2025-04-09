import NextAuth from "next-auth";
import { z } from "zod";
import { authConfig } from "./auth.config";
import { hashCode } from "@/lib/magic-code-utils";
import { Constants } from "@medialit/models";
import { getUniqueId } from "@medialit/utils";
import CredentialsProvider from "next-auth/providers/credentials";
import connectToDatabase from "@/lib/connect-db";
import VerificationToken from "@/models/verification-token";
import User from "@/models/user";
import Apikey from "@/models/apikey";
import { createUser } from "./lib/courselit";

export const { auth, signIn, signOut, handlers } = NextAuth({
    ...authConfig,
    providers: [
        CredentialsProvider({
            name: "Email",
            credentials: {},
            async authorize(credentials, req) {
                const parsedCredentials = z
                    .object({
                        email: z.string().email(),
                        code: z.string().min(6),
                    })
                    .safeParse(credentials);
                if (!parsedCredentials.success) {
                    return null;
                }

                const { email, code }: any = parsedCredentials.data;
                const sanitizedEmail = email.toLowerCase();

                await connectToDatabase();
                const verificationToken =
                    await VerificationToken.findOneAndDelete({
                        email: sanitizedEmail,
                        code: hashCode(code),
                        timestamp: { $gt: Date.now() },
                    });

                if (!verificationToken) {
                    return null;
                }

                let user = await User.findOne({
                    email: sanitizedEmail,
                });

                if (!user) {
                    user = await User.create({ email: sanitizedEmail });
                    await Apikey.create({
                        name: Constants.internalApikeyName,
                        key: getUniqueId(),
                        userId: user.id,
                        internal: true,
                    });
                    try {
                        await createUser({ email: sanitizedEmail });
                    } catch (err: any) {
                        console.error("Error creating user in CourseLit");
                        console.error(err);
                    }
                }
                return {
                    id: user.userId,
                    email: sanitizedEmail,
                    name: user.name,
                };
            },
        }),
    ],
});
