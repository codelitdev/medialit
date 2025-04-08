import React from "react";
import Link from "next/link";
import Tabs from "./tabs";
import { getApikeyUsingKeyId } from "@/app/actions";
import { redirect } from "next/navigation";

export default async function FilesLayout(props: {
    params: Promise<{ keyid: string }>;
    children: React.ReactNode;
}) {
    const params = await props.params;

    const { children } = props;

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
                        {apikey?.name || "Untitled"}
                    </span>
                </div>
                <Tabs keyid={keyid} />
                <div className="">{children}</div>
            </main>
        </>
    );
}
