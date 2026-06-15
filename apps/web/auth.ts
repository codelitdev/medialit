import NextAuth from "next-auth";
import { z } from "zod";
import { authConfig } from "./auth.config";
import { hashCode } from "@/lib/magic-code-utils";
import { Constants } from "@medialit/models";
import CredentialsProvider from "next-auth/providers/credentials";
import connectToDatabase from "@/lib/connect-db";
import VerificationToken from "@/models/verification-token";
import User from "@/models/user";
import { createUser } from "./lib/courselit";

export const { auth, signIn, signOut, handlers } = NextAuth({
    ...authConfig,
    providers: [
        // OAuth provider — uses the API's OAuth 2.0 Authorization Server
        {
            id: "medialit",
            name: "Medialit",
            type: "oauth" as const,
            clientId: "web-client",
            clientSecret: "",
            authorization: {
                url: "http://localhost:8000/oauth/authorize",
                params: {
                    scope: "",
                    response_type: "code",
                    code_challenge_method: "S256",
                },
            },
            token: "http://localhost:8000/oauth/token",
            profile(profile) {
                return {
                    id: profile.sub || profile.userId,
                    email: profile.email,
                    name: profile.name,
                };
            },
        },
        // Credentials provider — keeps the existing email+OTP login page working
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
                    user = await User.create({
                        email: sanitizedEmail,
                        active: true,
                        subscriptionStatus:
                            Constants.SubscriptionStatus.NOT_SUBSCRIBED,
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
