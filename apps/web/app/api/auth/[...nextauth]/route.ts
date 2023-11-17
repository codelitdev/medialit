import { NextAuthOptions } from "next-auth";
import NextAuth from "next-auth/next";
import CredentialsProvider from "next-auth/providers/credentials";
import VerificationToken from "@/models/verification-token";
import { hashCode } from "@/lib/utils";
import User from "@/models/user";
import connectToDatabase from "@/lib/connect-db";
import { NextApiRequest, NextApiResponse } from "next";

export const authOptions: NextAuthOptions = {
    providers: [
        CredentialsProvider({
            name: "Email",
            credentials: {},
            async authorize(credentials, req) {
                const { email, code }: any = credentials;
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
                }
                return {
                    id: user.userId,
                    email,
                    name: user.name,
                };
            },
        }),
    ],
    pages: {
        signIn: "/api/auth/sign-in",
    },
    secret: process.env.NEXTAUTH_SECRET,
    callbacks: {
        async redirect({ url, baseUrl }) {
            return baseUrl;
        },
    },
};

async function auth(req: NextApiRequest, res: NextApiResponse) {
    return await NextAuth(req, res, authOptions);
}
export { auth as GET, auth as POST };
