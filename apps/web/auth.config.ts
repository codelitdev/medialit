// import { supabase } from "@/lib/supabase";
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
    debug: true,
    // pages: {
    //   signIn: "/login",
    // },
    pages: {
        signIn: "/api/auth/sign-in",
    },
    callbacks: {
        async redirect({ url, baseUrl }: any) {
            return baseUrl;
        },
    },
    // callbacks: {
    //   async authorized({ auth, request: { nextUrl } }) {
    //     //   console.log(auth, nextUrl);
    //     const isLoggedIn = !!auth?.user;
    //     const isOnDashboard = nextUrl.pathname.startsWith("/dashboard");
    //     if (isOnDashboard) {
    //       if (isLoggedIn) return true;
    //       return false; // Redirect unauthenticated users to login page
    //     } else if (isLoggedIn) {
    //       return Response.redirect(new URL("/dashboard", nextUrl));
    //     }
    //     return true;
    //   },
    // },

    providers: [], // Add providers with an empty array for now
} satisfies NextAuthConfig;
