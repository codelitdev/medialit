import React from "react";
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
} from "@/components/ui/breadcrumb";
import Link from "next/link";
import { ReactNode } from "react";
import { redirect } from "next/navigation";
import Script from "next/script";
import { auth } from "@/auth";

export default async function SchoolDetailsLayout({
    params,
    children,
}: {
    params: Promise<{ name: string }>;
    children: ReactNode;
}) {
    const session = await auth();

    if (!session) {
        return redirect("/login?from=/account/billing");
    }

    return (
        <>
            <main className="mx-auto max-w-[1024px] min-h-screen">
                <Breadcrumb className="mb-2">
                    <BreadcrumbList>
                        <BreadcrumbItem>
                            <BreadcrumbLink href="/">All apps</BreadcrumbLink>
                        </BreadcrumbItem>
                    </BreadcrumbList>
                </Breadcrumb>
                <h1 className="text-2xl font-bold mb-8">Billing</h1>
                <Script
                    src="https://app.lemonsqueezy.com/js/lemon.js"
                    strategy="beforeInteractive"
                    id="lemonsqueezy"
                />
                {children}
            </main>
        </>
    );
}
