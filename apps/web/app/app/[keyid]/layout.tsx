import React from "react";
import Link from "next/link";
import Tabs from "./tabs";
import { getApikeyUsingKeyId } from "@/app/actions";
import { redirect } from "next/navigation";

export default async function FilesLayout({
    params,
    children,
}: {
    params: { keyid: string };
    children: React.ReactNode;
}) {
    const keyid = params.keyid;
    const apikey = await getApikeyUsingKeyId(keyid);

    if (!apikey) {
        redirect("/");
    }

    return (
        <>
            <main className="mx-auto max-w-[1024px] min-h-screen">
                <div className="text-primary font-semibold py-2">
                    <Link href="/">All apps </Link>/{" "}
                    <span className="text-muted-foreground">
                        {apikey?.name}
                    </span>
                </div>
                <Tabs keyid={keyid} />
                <div className="">{children}</div>
            </main>
        </>
    );
}
