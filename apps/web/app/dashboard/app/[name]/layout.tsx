import React from "react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { NavBar } from "@/components/nav-bar";
import Link from "next/link";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
    title: "Medialit",
    description: "",
};

export default async function RootLayout({
    params,
    searchParams,
    children,
}: {
    params: { name: string };
    searchParams: { page: string };
    children: React.ReactNode;
}) {
    const name = params.name;
    const decodedName = decodeURI(name);
    // const decodeURIComponentName = decodeURIComponent(name);
    // console.log("decodedName", decodedName, name);
    // console.log("decodeURIComponentName", decodeURIComponentName, name);
    
    return (
        <html lang="en">
            <body className={inter.className}>
                <NavBar />
                <main className="mx-auto max-w-[1024px] min-h-screen">
                    <div className="text-primary font-semibold mt-5 px-2">
                        <Link href="/dashboard">
                            {" "}
                            All apps /{" "}
                            <span className="text-muted-foreground">
                                {decodedName}
                            </span>
                        </Link>
                    </div>
                    <div className="px-2 py-8 ">{children}</div>
                </main>
                {/* <Footer /> */}
            </body>
        </html>
    );
}
