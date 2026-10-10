import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function BillingLayout({
    children,
}: {
    children: ReactNode;
}) {
    const session = await auth();
    if (!session) redirect("/login?next=/account/billing");

    return (
        <>
            <div className="workspace-page-heading">
                <div>
                    <h1>Billing</h1>
                    <p>Manage your plan and payment settings.</p>
                </div>
            </div>
            {children}
        </>
    );
}
