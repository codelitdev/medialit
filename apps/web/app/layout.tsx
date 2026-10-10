import type { Metadata } from "next";
import { Hanken_Grotesk, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";
import DashboardShell from "@/components/dashboard-shell";
import { Toaster } from "@/components/ui/sonner";
import Scripts from "./scripts";
import { auth } from "@/auth";
import { getApiKeys, getAppsDashboard } from "./actions";

const hankenGrotesk = Hanken_Grotesk({
    subsets: ["latin"],
    variable: "--font-sans",
});
const splineSansMono = Spline_Sans_Mono({
    subsets: ["latin"],
    variable: "--font-mono",
});

export const metadata: Metadata = {
    title: "MediaLit",
    description: "Manage and serve your app’s media from one place.",
};

export default async function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();
    const dashboard = session ? await getAppsDashboard() : null;
    const apps = dashboard?.apps ?? (session ? await getApiKeys() : []);

    return (
        <html
            lang="en"
            data-product="medialit"
            className={`${hankenGrotesk.variable} ${splineSansMono.variable}`}
        >
            <head></head>
            <body>
                <DashboardShell
                    apps={Array.isArray(apps) ? apps : []}
                    user={session?.user ?? null}
                >
                    {children}
                </DashboardShell>
                <Toaster />
                <Scripts />
            </body>
        </html>
    );
}
