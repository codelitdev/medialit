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
        <div>
            <div className="text-primary font-semibold py-2">
                <Link href="/" className="hover:border-b-2 border-primary">
                    All apps{" "}
                </Link>
                / <span className="text-muted-foreground">Billing</span>
            </div>
            <Script
                src="https://app.lemonsqueezy.com/js/lemon.js"
                strategy="beforeInteractive"
                id="lemonsqueezy"
            />
            {children}
        </div>
    );
}
