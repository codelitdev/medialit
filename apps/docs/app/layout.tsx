import "@codelitdev/design-system/styles.css";
import "./global.css";
import { RootProvider } from "fumadocs-ui/provider/next";
import { Hanken_Grotesk, Spline_Sans_Mono } from "next/font/google";
import type { ReactNode } from "react";

const hankenGrotesk = Hanken_Grotesk({
    subsets: ["latin"],
    variable: "--font-sans",
});
const splineSansMono = Spline_Sans_Mono({
    subsets: ["latin"],
    variable: "--font-mono",
});

export default function Layout({ children }: { children: ReactNode }) {
    return (
        // `data-product` goes on <html> so tokens aliased at :root pick up
        // MediaLit's accent (see the design system's README).
        <html
            lang="en"
            data-product="medialit"
            className={`font-sans ${hankenGrotesk.variable} ${splineSansMono.variable}`}
            suppressHydrationWarning
        >
            <body className="flex flex-col min-h-screen antialiased">
                <RootProvider
                    search={{
                        enabled: false,
                    }}
                >
                    {children}
                </RootProvider>
            </body>
        </html>
    );
}
