import React from "react";
import { redirect } from "next/navigation";
import { getApikeyUsingKeyId } from "@/app/actions";

export default async function AppLayout(props: {
    params: Promise<{ keyid: string }>;
    children: React.ReactNode;
}) {
    const { keyid } = await props.params;
    const apikey = await getApikeyUsingKeyId(keyid);
    if (!apikey) redirect("/");

    return <>{props.children}</>;
}
