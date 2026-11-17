import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";
import DashboardShell from "@/components/dashboard-shell";
import { Toaster } from "@/components/ui/sonner";
import Scripts from "./scripts";
import ServiceWorker from "@/components/service-worker";
import { auth } from "@/auth";
import { getApps, getAppsDashboard } from "./actions";

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
    applicationName: "MediaLit",
    // A static file: a generated app/manifest.ts recompiles on every request
    // in dev, and the hot reload that follows reloads the page in a loop.
    manifest: "/manifest.webmanifest",
    appleWebApp: {
        capable: true,
        title: "MediaLit",
        statusBarStyle: "default",
    },
    icons: {
        apple: "/icons/apple-touch-icon.png",
    },
};

/* `cover` lets full-screen views reach the screen edges on notched phones;
   they pad themselves with the safe-area insets. */
export const viewport: Viewport = {
    themeColor: "#f9f6f2",
    viewportFit: "cover",
};

export default async function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();
    const dashboard = session ? await getAppsDashboard() : null;
    const apps = dashboard?.apps ?? (session ? await getApps() : []);

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
                <ServiceWorker />
            </body>
        </html>
    );
}
