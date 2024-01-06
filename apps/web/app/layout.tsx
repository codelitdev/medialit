import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
// import { getServerSession } from "next-auth";
// import SessionProvider from "./components/SessionProvider";
// import { authOptions } from "./api/auth/[...nextauth]/route";
import Footer from "../components/Footer";
import NavMenu  from "../components/NavMenu";
import { auth } from "@/auth";
import { NavBar } from "../components/nav-bar";

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
    // const session = await getServerSession(authOptions);
    const session = await auth();
    return (
        <html lang="en">
            <body className={inter.className}>
                    <main className="mx-auto max-w-[1024px]">
                        {/* <NavMenu /> */}
                        <NavBar/>
                        <div className="p-4 min-h-screen">{children}</div>
                    </main>
                    <Footer />
            </body>
        </html>
    );
}
