import React from "react";
import { redirect } from "next/navigation";
import { getApp } from "@/app/actions";

export default async function AppLayout(props: {
    params: Promise<{ appId: string }>;
    children: React.ReactNode;
}) {
    const { appId } = await props.params;
    const app = await getApp(appId);
    if (!app) redirect("/");

    return <>{props.children}</>;
}
