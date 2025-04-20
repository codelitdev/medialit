import React from "react";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getApikeyUsingKeyId } from "@/app/actions";
import { redirect } from "next/navigation";
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

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
                <Breadcrumb className="mb-2">
                    <BreadcrumbList>
                        <BreadcrumbItem>
                            <BreadcrumbLink href="/">All apps</BreadcrumbLink>
                        </BreadcrumbItem>
                        {/* <BreadcrumbSeparator />
                        <BreadcrumbItem>
                            <BreadcrumbPage className="text-muted-foreground">
                                {apikey?.name || "Untitled"}
                            </BreadcrumbPage>
                        </BreadcrumbItem> */}
                    </BreadcrumbList>
                </Breadcrumb>
                <h1 className="text-2xl font-bold mb-8">
                    {apikey?.name || "Untitled"}
                </h1>
                <Tabs
                    defaultValue={`/app/${keyid}/files`}
                    className="w-full mb-8"
                >
                    <TabsList className="grid w-full grid-cols-2">
                        <Link href={`/app/${keyid}/files`}>
                            <TabsTrigger
                                value={`/app/${keyid}/files`}
                                className="w-full"
                            >
                                Files
                            </TabsTrigger>
                        </Link>
                        <Link href={`/app/${keyid}/settings`}>
                            <TabsTrigger
                                value={`/app/${keyid}/settings`}
                                className="w-full"
                            >
                                Settings
                            </TabsTrigger>
                        </Link>
                    </TabsList>
                </Tabs>
                <div className="">{children}</div>
            </main>
        </>
    );
}
