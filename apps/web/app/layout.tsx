import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { getServerSession } from "next-auth";
import SessionProvider from "./components/SessionProvider";
import { authOptions } from "./api/auth/[...nextauth]/route";
import Footer from "./components/Footer";
import NavMenu  from "./components/NavMenu";

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
    const session = await getServerSession(authOptions);
    return (
        <html lang="en">
            <body className={inter.className}>
                <SessionProvider session={session}>
                    <main className="mx-auto max-w-[1024px]">
                        <NavMenu />
                        <div className="p-4 min-h-screen">{children}</div>
                    </main>
                    <Footer />
                </SessionProvider>
            </body>
        </html>
    );
}
