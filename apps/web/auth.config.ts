import { type NextAuthConfig } from "next-auth";

export const authConfig = {
    debug: true,
    pages: {
        signIn: "/login",
    },
    callbacks: {
        async redirect({ url, baseUrl }: any) {
            return baseUrl;
        },
    },

    providers: [], // Add providers with an empty array for now
} satisfies NextAuthConfig;
