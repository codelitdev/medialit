import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { NavBar } from "../components/nav-bar";
import { Toaster } from "@/components/ui/toaster";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
    title: "Medialit",
    description: "",
};

export default async function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body className={inter.className}>
                <NavBar />
                <main className="mx-auto max-w-[1024px] min-h-screen">
                    <div className="px-2 py-8 ">{children}</div>
                </main>
                <Toaster />
                {/* <Footer /> */}
            </body>
        </html>
    );
}
