import { NextAuthOptions } from "next-auth";
import NextAuth from "next-auth/next";
import CredentialsProvider from "next-auth/providers/credentials";
import VerificationToken from "@/models/verification-token";
import { hashCode } from "@/lib/utils";
import User from "@/models/user";
import connectToDatabase from "@/lib/connect-db";

export const authOptions: NextAuthOptions = {
    providers: [
        CredentialsProvider({
            name: "Email",
            credentials: {},
            async authorize(credentials, req) {
                const { email, code }: any = credentials;
                const domain = req.headers?.host?.split(".")[0] || "main";
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
    callbacks: {
        async redirect({ url, baseUrl }) {
            return url;
        },
    },
};

async function auth(req: Request, res: Response) {
    return await NextAuth(req, res, authOptions);
}
export { auth as GET, auth as POST };
