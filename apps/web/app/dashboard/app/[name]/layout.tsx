import React from "react";
import Link from "next/link";
import AppLinks from "./appLinks";

export default async function FilesLayout({
    params,
    children,
}: {
    params: { name: string };
    children: React.ReactNode;
}) {
    const name = params.name;
    const decodedName = decodeURI(name);

    return (
        <>
            <main className="mx-auto max-w-[1024px] min-h-screen">
                <div className="text-primary font-semibold py-2">
                    <Link href="/dashboard">All apps </Link>/{" "}
                    <span className="text-muted-foreground">{decodedName}</span>
                </div>
                <AppLinks
                    params={{
                        name: name,
                    }}
                />
                <div className="">{children}</div>
            </main>
        </>
    );
}
