"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default async function AppLinks({
    params,
}: {
    params: { name: string };
}) {
    const name = params.name;
    const currentPathName = usePathname();

    const appLinks = [
        { name: "Files", href: `/dashboard/app/${name}/files` },
        { name: "Settings", href: `/dashboard/app/${name}/settings` },
    ];

    return (
        <>
            <ul className="flex gap-2 font-bold text-xl py-2">
                {appLinks.map((link) => (
                    <li key={link.href}>
                        <Link
                            href={link.href}
                            className={
                                currentPathName === link.href
                                    ? "border-b-2 border-primary"
                                    : ""
                            }
                        >
                            {link.name}
                        </Link>
                    </li>
                ))}
            </ul>
        </>
    );
}
