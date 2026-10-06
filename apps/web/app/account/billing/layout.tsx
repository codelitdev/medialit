import React from "react";
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
} from "@/components/ui/breadcrumb";
import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

const SchoolDetailsLayout = async ({ children }: { children: ReactNode }) => {
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
                {children}
            </main>
        </>
    );
};

export default SchoolDetailsLayout as any;
