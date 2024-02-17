"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default async function Tabs({ keyid }: { keyid: string }) {
    const currentPathName = usePathname();

    const tabs = [
        { name: "Files", href: `/app/${keyid}/files` },
        { name: "Settings", href: `/app/${keyid}/settings` },
    ];

    return (
        <ul className="flex gap-2 font-bold text-xl py-2">
            {tabs.map((tab) => (
                <li key={tab.href}>
                    <Link
                        href={tab.href}
                        className={
                            currentPathName === tab.href
                                ? "border-b-2 border-primary"
                                : ""
                        }
                    >
                        {tab.name}
                    </Link>
                </li>
            ))}
        </ul>
    );
}
