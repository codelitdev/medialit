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
                await connectToDatabase();
                const verificationToken =
                    await VerificationToken.findOneAndDelete({
                        email,
                        code: hashCode(code),
                        timestamp: { $gt: Date.now() },
                    });

                if (!verificationToken) {
                    return null;
                }

                let user = await User.findOne({
                    email,
                });

                if (!user) {
                    user = await User.create({
                        email,
                    });
                    await Apikey.create({
                        name: Constants.internalApikeyName,
                        key: getUniqueId(),
                        userId: user.id,
                        internal: true,
                    });
                }
                return {
                    id: user.userId,
                    email,
                    name: user.name,
                };
            },
        }),
    ],
});
