import React from "react";
import Link from "next/link";

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
                <div className="text-primary font-semibold px-2">
                    <Link href="/dashboard">
                     All apps {" "}   
                    </Link>
                    /{" "}
                    <span className="text-muted-foreground">
                        {decodedName}
                    </span>
                </div>
                <div className="px-2 py-8 ">{children}</div>
            </main>
        </>
    );
}